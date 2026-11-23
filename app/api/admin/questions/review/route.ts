
import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST(req: Request) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ids = body?.ids;

    if (
      !Array.isArray(ids) ||
      ids.length !== 5 ||
      ids.some((id: unknown) => !Number.isInteger(id) || Number(id) <= 0) ||
      new Set(ids).size !== 5
    ) {
      return NextResponse.json(
        { error: 'Provide exactly five unique question IDs.' },
        { status: 400 }
      );
    }

    const questions = [];

    for (const id of ids) {
      const rows = await sql`
        SELECT id, category, difficulty, prompt, scenario,
               options, correct_option, explanation,
               learning_objective, status, quality_reviewed_at
        FROM questions
        WHERE id = ${id}
        LIMIT 1
      `;

      if (!rows.length || rows[0].status !== 'draft' ||
          rows[0].quality_reviewed_at) {
        return NextResponse.json({
          error: `Question ${id} is missing or is not an unreviewed draft.`
        }, { status: 409 });
      }

      questions.push(rows[0]);
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is missing.');
    }

    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `You are an independent strict technology assessment reviewer.
Review exactly five questions.
Check factual accuracy, technical correctness, exactly one valid answer,
unambiguous wording, explanation accuracy and duplicate content.
Do not repair questions.
Reject uncertain or incorrect questions.
Return JSON only:
{"reviews":[{"id":37,"approved":true,"feedback":"Reason"}]}`
            },
            {
              role: 'user',
              content: JSON.stringify(questions)
            }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      }
    );

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) throw new Error('Empty reviewer response.');

    const parsed = JSON.parse(content);
    const reviews = parsed.reviews;

    if (
      !Array.isArray(reviews) ||
      reviews.length !== 5 ||
      new Set(reviews.map((r: { id: number }) => r.id)).size !== 5 ||
      ids.some((id: number) =>
        !reviews.some((r: { id: number; approved: boolean; feedback: string }) =>
          r.id === id &&
          typeof r.approved === 'boolean' &&
          typeof r.feedback === 'string'
        )
      )
    ) {
      throw new Error('Invalid reviewer verdicts. No questions were changed.');
    }

    const results = [];

    for (const review of reviews) {
      const approved = review.approved === true;

      await sql`
        UPDATE questions
        SET status = ${approved ? 'approved' : 'draft'},
            quality_reviewed_at = NOW(),
            quality_review_model = ${model}
        WHERE id = ${review.id}
          AND status = 'draft'
          AND quality_reviewed_at IS NULL
      `;

      results.push({
        id: review.id,
        status: approved ? 'approved' : 'draft',
        feedback: review.feedback
      });
    }

    return NextResponse.json({
      success: true,
      reviewedCount: results.length,
      approvedCount: results.filter(r => r.status === 'approved').length,
      results
    });

  } catch (error) {
    console.error('Manual question review error:', error);

    return NextResponse.json({
      error: 'Question review failed.',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
