
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const idsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).length(5),
});

const optionSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().trim().min(3).max(300),
});

const questionSchema = z.object({
  category: z.string().trim().min(2).max(40),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  prompt: z.string().trim().min(35).max(600),
  scenario: z.string().trim().max(700).nullable(),
  options: z.array(optionSchema).length(4),
  correct_option: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().trim().min(40).max(800),
  learning_objective: z.string().trim().min(8).max(240).nullable(),
}).refine(
  (q) => new Set(q.options.map((item) => item.id)).size === 4,
  { message: 'Option IDs must be unique.' }
).refine(
  (q) => new Set(q.options.map((item) => normalise(item.text))).size === 4,
  { message: 'Option texts must be unique.' }
).refine(
  (q) => q.options.some((item) => item.id === q.correct_option),
  { message: 'Correct answer must exist in the options.' }
);

const reviewSchema = z.object({
  reviews: z.array(
    z.object({
      id: z.number().int().positive(),
      approved: z.boolean(),
      factually_supported: z.boolean(),
      unambiguous: z.boolean(),
      correct_answer_valid: z.boolean(),
      duplicate: z.boolean(),
      feedback: z.string().trim().min(1).max(500),
    })
  ).length(5),
});

type Candidate = z.infer<typeof questionSchema>;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(question: Candidate): string {
  return createHash('sha256')
    .update(
      normalise([
        question.category,
        question.prompt,
        question.scenario ?? '',
        ...question.options.map((item) => item.text),
      ].join(' '))
    )
    .digest('hex');
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const body: unknown = await req.json();
    const input = idsSchema.safeParse(body);

    if (!input.success) {
      return NextResponse.json(
        { error: 'Provide exactly five valid question IDs.' },
        { status: 400 }
      );
    }

    const ids = input.data.ids;

    if (new Set(ids).size !== 5) {
      return NextResponse.json(
        { error: 'Question IDs must be unique.' },
        { status: 400 }
      );
    }

    // Load and validate all five questions.
    const questions: Array<{
      id: number;
      question: Candidate;
    }> = [];

    for (const id of ids) {
      const rows = await sql`
        SELECT
          id,
          category,
          difficulty,
          prompt,
          scenario,
          options,
          correct_option,
          explanation,
          learning_objective,
          status,
          quality_reviewed_at
        FROM questions
        WHERE id = ${id}
        LIMIT 1
      `;

      if (
        !rows.length ||
        rows[0].status !== 'draft' ||
        rows[0].quality_reviewed_at
      ) {
        return NextResponse.json(
          {
            error: `Question ${id} is missing or is not an unreviewed draft.`,
          },
          { status: 409 }
        );
      }

      const parsed = questionSchema.safeParse({
        category: rows[0].category,
        difficulty: rows[0].difficulty,
        prompt: rows[0].prompt,
        scenario: rows[0].scenario,
        options: rows[0].options,
        correct_option: rows[0].correct_option,
        explanation: rows[0].explanation,
        learning_objective: rows[0].learning_objective,
      });

      if (!parsed.success) {
        return NextResponse.json(
          {
            error: `Question ${id} failed structural validation.`,
            details: parsed.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          { status: 422 }
        );
      }

      questions.push({
        id,
        question: parsed.data,
      });
    }

    // Check whether the five questions contain identical fingerprints.
    const hashes = questions.map((item) =>
      fingerprint(item.question)
    );

    if (new Set(hashes).size !== 5) {
      return NextResponse.json(
        { error: 'Duplicate questions detected in the submitted set.' },
        { status: 422 }
      );
    }

    // Load recent question history, excluding the five candidates.
    const history = await sql`
      SELECT id, category, prompt, scenario, options
      FROM questions
      WHERE NOT (id = ANY(${ids}))
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const historyForReview = history.map((row) => ({
      id: Number(row.id),
      category: String(row.category),
      prompt: String(row.prompt),
      scenario: String(row.scenario ?? ''),
      options: row.options ?? [],
    }));

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error('GROQ_API_KEY is missing.');
    }

    const model =
      process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

    let reviewerResponse: Response | null = null;

    for (let retry = 0; retry < 3; retry += 1) {
      reviewerResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1200,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `
You are an independent and strict technology assessment quality reviewer.

You did not create these questions.

Review exactly five candidate questions using their original database IDs.

For EACH question, independently check:

1. Factual support: Is the question technically and factually correct?
2. Correct answer: Is the marked answer actually correct?
3. Unambiguity: Is there exactly one defensible best answer?
4. Explanation: Does the explanation accurately support the marked answer?
5. Options: Are all four options meaningful, distinct and appropriate?
6. Duplicate: Is the question substantially similar to another candidate or to a question in the supplied history?

Do not repair, rewrite or guess missing information.
Do not approve uncertain questions.
A question must fail if any important requirement is not satisfied.

Approval rules:
- approved must be true only if all checks pass.
- factually_supported must be true only if the facts are correct.
- unambiguous must be true only if there is one clear best answer.
- correct_answer_valid must be true only if the marked option is correct.
- duplicate must be true if the question duplicates or closely paraphrases another question.

Return JSON only in this exact structure:

{
  "reviews": [
    {
      "id": 37,
      "approved": true,
      "factually_supported": true,
      "unambiguous": true,
      "correct_answer_valid": true,
      "duplicate": false,
      "feedback": "Brief explanation of the decision."
    }
  ]
}

Return exactly one review for each supplied candidate ID.
Never replace the original database IDs with numbering such as 1, 2, 3, 4, 5.
`,
            },
            {
              role: 'user',
              content: JSON.stringify({
                candidates: questions.map((item) => ({
                  id: item.id,
                  ...item.question,
                })),
                recentQuestionHistory: historyForReview,
              }),
            },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      }
      );

      if (reviewerResponse.ok || reviewerResponse.status !== 429 || retry === 2) {
        break;
      }

      const retryAfter = Number(reviewerResponse.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 45000)
        : (retry + 1) * 20000;

      console.warn('Groq reviewer rate limit reached; waiting before retry', {
        retry: retry + 1,
        delayMs,
      });
      await wait(delayMs);
    }

    if (!reviewerResponse?.ok) {
      const status = reviewerResponse?.status ?? 0;
      const detail = reviewerResponse ? await reviewerResponse.text() : 'No response from Groq';
      throw new Error(
        `Groq reviewer error ${status}: ${detail.slice(0, 250)}`
      );
    }

    const responsePayload: unknown = await reviewerResponse.json();

    const choices =
      responsePayload &&
      typeof responsePayload === 'object' &&
      'choices' in responsePayload &&
      Array.isArray(responsePayload.choices)
        ? responsePayload.choices
        : [];

    const first = choices[0];

    const message =
      first &&
      typeof first === 'object' &&
      'message' in first
        ? first.message
        : null;

    const content =
      message &&
      typeof message === 'object' &&
      'content' in message
        ? message.content
        : null;

    if (typeof content !== 'string') {
      throw new Error('Reviewer returned empty content.');
    }

    let parsedResponse: unknown;

    try {
      parsedResponse = JSON.parse(content);
    } catch {
      throw new Error('Reviewer returned invalid JSON.');
    }

    const validatedReview = reviewSchema.safeParse(parsedResponse);

    if (!validatedReview.success) {
      throw new Error(
        'Reviewer response failed validation: ' +
        validatedReview.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')
      );
    }

    const reviews = validatedReview.data.reviews;

    if (
      new Set(reviews.map((review) => review.id)).size !== 5 ||
      ids.some((id) => !reviews.some((review) => review.id === id))
    ) {
      throw new Error(
        'Reviewer did not return exactly one valid verdict for every submitted question.'
      );
    }

    // Only approve questions that pass every required quality check.
    const updates = reviews.map((review) => {
      const approved =
        review.approved &&
        review.factually_supported &&
        review.unambiguous &&
        review.correct_answer_valid &&
        !review.duplicate;

      const question = questions.find(
        (item) => item.id === review.id
      );

      if (!question) {
        throw new Error(`Unknown reviewer question ID: ${review.id}`);
      }

      return {
        id: review.id,
        approved,
        feedback: review.feedback,
        content_fingerprint: fingerprint(question.question),
      };
    });

    // One atomic SQL statement. If all five are not eligible,
    // none of the five questions will be updated.
    const updated = await sql`
      WITH verdicts AS (
        SELECT *
        FROM jsonb_to_recordset(
          ${JSON.stringify(updates)}::jsonb
        ) AS v(
          id BIGINT,
          approved BOOLEAN,
          feedback TEXT,
          content_fingerprint TEXT
        )
      ),
      eligible AS (
        SELECT q.id
        FROM questions q
        INNER JOIN verdicts v ON v.id = q.id
        WHERE q.status = 'draft'
          AND q.quality_reviewed_at IS NULL
      ),
      eligible_count AS (
        SELECT COUNT(*)::int AS total
        FROM eligible
      ),
      changed AS (
        UPDATE questions q
        SET
          status = CASE
            WHEN v.approved THEN 'approved'
            ELSE 'draft'
          END,
          content_fingerprint = v.content_fingerprint,
          quality_reviewed_at = NOW(),
          quality_review_model = ${model}
        FROM verdicts v
        INNER JOIN eligible e ON e.id = v.id
        CROSS JOIN eligible_count ec
        WHERE q.id = v.id
          AND ec.total = 5
        RETURNING q.id, q.status
      )
      SELECT id, status
      FROM changed
    `;

    if (updated.length !== 5) {
      return NextResponse.json(
        {
          error:
            'No questions were changed. One or more questions are no longer eligible for review. Reload and try again.',
        },
        { status: 409 }
      );
    }

    const results = reviews.map((review) => {
      const saved = updated.find(
        (row) => Number(row.id) === review.id
      );

      return {
        id: review.id,
        status: saved?.status,
        approved: saved?.status === 'approved',
        feedback: review.feedback,
        checks: {
          factually_supported: review.factually_supported,
          unambiguous: review.unambiguous,
          correct_answer_valid: review.correct_answer_valid,
          duplicate: review.duplicate,
        },
      };
    });

    return NextResponse.json({
      success: true,
      reviewedCount: results.length,
      approvedCount: results.filter(
        (item) => item.approved
      ).length,
      rejectedCount: results.filter(
        (item) => !item.approved
      ).length,
      reviewModel: model,
      results,
    });
  } catch (error) {
    console.error('Manual question review error:', error);

    return NextResponse.json(
      {
        error: 'Question review failed.',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
