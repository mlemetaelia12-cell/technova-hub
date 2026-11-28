
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { tanzaniaDate } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 210;

const MAX_GENERATION_ATTEMPTS = 3;
const GROQ_MAX_RETRIES = 2;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const optionSchema = z.object({
  id: z.enum(['A', 'B', 'C', 'D']),
  text: z.string().trim().min(3).max(300),
});

const questionSchema = z
  .object({
    category: z.string().trim().min(2).max(40),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    prompt: z.string().trim().min(35).max(600),
    scenario: z.string().trim().max(700).nullable(),
    options: z.array(optionSchema).length(4),
    correct_option: z.enum(['A', 'B', 'C', 'D']),
    explanation: z.string().trim().min(40).max(800),
    learning_objective: z.string().trim().min(8).max(240),
  })
  .refine((q) => new Set(q.options.map((item) => item.id)).size === 4)
  .refine(
    (q) =>
      new Set(q.options.map((item) => normalise(item.text))).size === 4
  );

const payloadSchema = z.object({
  questions: z.array(questionSchema).length(5),
});

const reviewSchema = z.object({
  reviews: z
    .array(
      z.object({
        id: z.number().int().min(1).max(5),
        approved: z.boolean(),
        factually_supported: z.boolean(),
        unambiguous: z.boolean(),
        correct_answer_valid: z.boolean(),
        duplicate: z.boolean(),
        feedback: z.string().max(500),
      })
    )
    .length(5),
});

type Candidate = z.infer<typeof questionSchema>;

async function cleanupOldDailyChallenges(today: string): Promise<{
  deletedChallenges: number;
  deletedQuestions: number;
}> {
  const todayCompact = today.replaceAll('-', '');

  const deletedChallengeRows = await sql`
    DELETE FROM daily_challenges dc
    WHERE dc.challenge_date < ${today}::date
      AND NOT EXISTS (
        SELECT 1
        FROM challenge_attempts ca
        WHERE ca.challenge_id = dc.id
      )
    RETURNING dc.id
  `;

  const deletedQuestionRows = await sql`
    DELETE FROM questions q
    WHERE q.question_code ~ '^AI-[0-9]{8}-[1-9][0-9]*$'
      AND substring(q.question_code FROM 4 FOR 8) < ${todayCompact}
      AND NOT EXISTS (
        SELECT 1
        FROM daily_challenge_questions dcq
        WHERE dcq.question_id = q.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM challenge_attempts ca
        WHERE ca.question_id = q.id
      )
    RETURNING q.id
  `;

  return {
    deletedChallenges: deletedChallengeRows.length,
    deletedQuestions: deletedQuestionRows.length,
  };
}

async function runOldChallengeCleanup(today: string) {
  try {
    const result = await cleanupOldDailyChallenges(today);
    console.info('Old daily challenge cleanup completed:', result);
    return result;
  } catch (error) {
    console.error('Old daily challenge cleanup failed:', error);
    return {
      deletedChallenges: 0,
      deletedQuestions: 0,
      cleanupError: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stopWords = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'what', 'when',
  'where', 'which', 'your', 'you', 'are', 'can', 'how', 'does', 'use',
  'using', 'about', 'into', 'should', 'would', 'could', 'will', 'their',
  'they', 'them', 'than', 'then', 'have', 'has', 'was', 'were', 'its',
  'not', 'one', 'two', 'three', 'after', 'before', 'best', 'most', 'more',
  'less', 'why', 'who', 'all', 'any', 'did', 'doesnt', 'is', 'in', 'on',
  'to', 'of', 'a', 'an', 'or', 'as', 'by', 'it', 'be', 'if', 'at',
]);

function terms(value: string): string[] {
  return normalise(value)
    .split(' ')
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function shingles(value: string): Set<string> {
  const list = terms(value);
  const output = new Set<string>();

  for (let index = 0; index < list.length; index += 1) {
    output.add(list[index]);
    if (index + 1 < list.length) {
      output.add(`${list[index]}_${list[index + 1]}`);
    }
  }

  return output;
}

function overlap(a: string, b: string): number {
  const left = shingles(a);
  const right = shingles(b);

  if (!left.size || !right.size) return 0;

  let common = 0;
  for (const token of left) {
    if (right.has(token)) common += 1;
  }

  return common / (left.size + right.size - common);
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

function uniqueQuestion(question: Candidate): boolean {
  const optionTexts = question.options.map((item) => normalise(item.text));

  return (
    new Set(question.options.map((item) => item.id)).size === 4 &&
    new Set(optionTexts).size === 4 &&
    question.options.every((item) => item.text.trim().length >= 3) &&
    Boolean(question.options.find((item) => item.id === question.correct_option))
  );
}

function normaliseDifficulty(value: unknown): unknown {
  let raw = value;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    raw =
      record.level ??
      record.value ??
      record.name ??
      record.label ??
      record.difficulty;
  }

  if (typeof raw !== 'string') return raw;

  const cleaned = raw.trim().toLowerCase();

  const aliases: Record<string, 'easy' | 'medium' | 'hard'> = {
    easy: 'easy',
    beginner: 'easy',
    basic: 'easy',
    novice: 'easy',
    medium: 'medium',
    intermediate: 'medium',
    moderate: 'medium',
    hard: 'hard',
    advanced: 'hard',
    difficult: 'hard',
    expert: 'hard',
  };

  return aliases[cleaned] ?? cleaned;
}

function normaliseOptions(value: unknown): unknown {
  const getText = (item: unknown): unknown => {
    if (typeof item === 'string') return item;

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return record.text ?? record.option ?? record.label ?? record.value;
    }

    return item;
  };

  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (typeof item === 'string') {
        return { id: ['A', 'B', 'C', 'D'][index], text: item };
      }

      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        return {
          ...record,
          id: record.id ?? ['A', 'B', 'C', 'D'][index],
          text: getText(item),
        };
      }

      return item;
    });
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const ids = ['A', 'B', 'C', 'D'] as const;

    if (ids.some((id) => Object.prototype.hasOwnProperty.call(record, id))) {
      return ids
        .filter((id) => Object.prototype.hasOwnProperty.call(record, id))
        .map((id) => ({
          id,
          text: getText(record[id]),
        }));
    }

    if (Array.isArray(record.options)) {
      return normaliseOptions(record.options);
    }
  }

  return value;
}

function normaliseGeneratedPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.questions)) return value;

  return {
    ...root,
    questions: root.questions.map((question) => {
      if (!question || typeof question !== 'object' || Array.isArray(question)) {
        return question;
      }

      const item = question as Record<string, unknown>;

      return {
        ...item,
        difficulty: normaliseDifficulty(item.difficulty),
        options: normaliseOptions(item.options),
      };
    }),
  };
}

async function groqJson(system: string, user: string): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is missing');

  let response: Response | null = null;

  for (let retry = 0; retry <= GROQ_MAX_RETRIES; retry += 1) {
    response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          temperature: 0.1,
          max_tokens: system.includes('independent, strict assessment quality reviewer') ? 1200 : 2400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (response.ok || response.status !== 429 || retry === GROQ_MAX_RETRIES) {
      break;
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 45000)
      : (retry + 1) * 20000;

    console.warn('Groq rate limit reached; waiting before retry', {
      retry: retry + 1,
      delayMs,
    });
    await wait(delayMs);
  }

  if (!response?.ok) {
    const status = response?.status ?? 0;
    const detail = response ? await response.text() : 'No response from Groq';
    throw new Error(`Groq returned ${status}: ${detail.slice(0, 250)}`);
  }

  const payload: unknown = await response.json();

  const choices =
    payload &&
    typeof payload === 'object' &&
    'choices' in payload &&
    Array.isArray(payload.choices)
      ? payload.choices
      : [];

  const first = choices[0];
  const message =
    first && typeof first === 'object' && 'message' in first
      ? first.message
      : null;
  const content =
    message && typeof message === 'object' && 'content' in message
      ? message.content
      : null;

  if (typeof content !== 'string') {
    throw new Error('Groq returned no JSON content');
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('Groq returned content that was not valid JSON');
  }
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (
    !secret ||
    req.headers.get('authorization') !== `Bearer ${secret}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const date = tanzaniaDate();

  try {
    const prior = await sql`
      SELECT
        id,
        status,
        (
          SELECT COUNT(*)::int
          FROM daily_challenge_questions
          WHERE challenge_id = daily_challenges.id
        ) AS question_count
      FROM daily_challenges
      WHERE challenge_date = ${date}::date
      LIMIT 1
    `;

    if (prior[0]?.status === 'published') {
      const cleanup = await runOldChallengeCleanup(date);

      return NextResponse.json({
        ok: true,
        date,
        message: 'Challenge already published',
        cleanup,
      });
    }

    if (
      prior[0]?.status === 'scheduled' &&
      Number(prior[0].question_count) === 5
    ) {
      await sql`
        UPDATE daily_challenges
        SET status = 'published'
        WHERE id = ${prior[0].id}
      `;

      await sql`
        UPDATE question_generation_runs
        SET status = 'published', completed_at = NOW()
        WHERE challenge_date = ${date}::date
      `;

      const cleanup = await runOldChallengeCleanup(date);

      return NextResponse.json({
        ok: true,
        date,
        message: 'Recovered and published the prepared challenge',
        cleanup,
      });
    }

    if (prior.length) {
      await sql`
        DELETE FROM daily_challenges
        WHERE id = ${prior[0].id}
      `;
    }

    const lock = await sql`
      INSERT INTO question_generation_runs (challenge_date, status)
      VALUES (${date}::date, 'started')
      ON CONFLICT (challenge_date)
      DO UPDATE SET
        status = 'started',
        created_at = NOW(),
        completed_at = NULL,
        error_message = NULL
      WHERE
        question_generation_runs.status = 'failed'
        OR question_generation_runs.created_at < NOW() - INTERVAL '20 minutes'
      RETURNING id
    `;

    if (!lock.length) {
      return NextResponse.json({
        ok: true,
        date,
        message: 'Generation is already running or complete',
      });
    }

    await sql`
      DELETE FROM questions
      WHERE question_code LIKE ${`AI-${date.replaceAll('-', '')}-%`}
        AND NOT EXISTS (
          SELECT 1
          FROM daily_challenge_questions
          WHERE daily_challenge_questions.question_id = questions.id
        )
    `;

    let approvedCandidates: Candidate[] | null = null;
    let attemptsUsed = 0;
    let rejectionFeedback = '';

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const rawGenerated = await groqJson(
          `You are TECHNOVA HUB's professional technology assessment author.

Return valid JSON only. Generate exactly five original technology questions in a "questions" array.

Every question must contain:
- category: string, 2-40 characters.
- difficulty: exactly "easy", "medium", or "hard" (lowercase string only).
- prompt: string, 35-600 characters.
- scenario: string or null, maximum 700 characters.
- options: an ARRAY of exactly four objects, never an object.
  Each option must contain "id" (A, B, C, or D) and "text" (3-300 characters).
- correct_option: exactly "A", "B", "C", or "D".
- explanation: string, 40-800 characters.
- learning_objective: string, 8-240 characters.

Use this exact structure:
{
  "questions": [
    {
      "category": "Web Development",
      "difficulty": "easy",
      "prompt": "A complete question with enough detail to be meaningful?",
      "scenario": null,
      "options": [
        { "id": "A", "text": "First possible answer" },
        { "id": "B", "text": "Second possible answer" },
        { "id": "C", "text": "Third possible answer" },
        { "id": "D", "text": "Fourth possible answer" }
      ],
      "correct_option": "B",
      "explanation": "A clear explanation that supports the correct answer.",
      "learning_objective": "Understand web development fundamentals"
    }
  ]
}

The example shows the format; return five complete questions, not one.
Do not use "beginner", "intermediate", or "advanced" for difficulty.
Do not return options as an object keyed by A-D.
Use at least three distinct technology categories.
Make all options distinct and plausible, with exactly one defensible correct answer.
Prefer practical beginner-friendly scenarios.
Cover programming, web development, defensive cybersecurity, AI, databases, networking, and computer science across the set.
Do not provide dangerous cyber instructions or rely on frequently changing facts.
Do not add Markdown or text outside the JSON object.`,
          `Create five varied technology assessment questions for ${date}. Avoid recycled generic stems. Test practical understanding rather than trivia. Return exactly one JSON object with a "questions" array of five complete questions. This is generation attempt ${attempt} of ${MAX_GENERATION_ATTEMPTS}. ${rejectionFeedback ? `Previous attempt feedback: ${rejectionFeedback}. Avoid the rejected topic, concept, scenario, wording, and learning objective; create genuinely different questions.` : "Create a fresh, diverse set."}`
        );

        const normalizedGenerated = normaliseGeneratedPayload(rawGenerated);
        const generated = payloadSchema.safeParse(normalizedGenerated);

        if (!generated.success) {
          const validationErrors = generated.error.issues
            .map((issue) => {
              const path = issue.path.join('.') || 'root';
              return `${path}: ${issue.message}`;
            })
            .join('; ');

          throw new Error(
            `Generated questions failed structural validation: ${validationErrors}`
          );
        }

        const candidates = generated.data.questions;

        if (candidates.some((candidate) => !uniqueQuestion(candidate))) {
          throw new Error(
            'A question contains duplicate or invalid answer options'
          );
        }

        if (
          new Set(candidates.map((candidate) => normalise(candidate.category)))
            .size < 3
        ) {
          throw new Error(
            'The daily set must cover at least three distinct technology categories'
          );
        }

        const history = await sql`
          SELECT prompt, scenario, options
          FROM questions
          WHERE created_at > NOW() - INTERVAL '365 days'
          ORDER BY created_at DESC
          LIMIT 100
        `;

        const historyText = history.map((row, index) => ({
          id: index + 1,
          prompt: String(row.prompt),
          scenario: String(row.scenario ?? ''),
          options: Array.isArray(row.options) ? row.options : [],
        }));

        const accepted: string[] = [];

        for (const candidate of candidates) {
          const combined = [
            candidate.prompt,
            candidate.scenario ?? '',
            ...candidate.options.map((item) => item.text),
          ].join(' ');

          if (
            accepted.some((previous) => overlap(previous, combined) >= 0.4)
          ) {
            throw new Error('Generated questions are too similar to one another');
          }

          if (
            history.some((old) =>
              overlap(
                combined,
                [
                  String(old.prompt),
                  String(old.scenario ?? ''),
                  JSON.stringify(old.options),
                ].join(' ')
              ) >= 0.48
            )
          ) {
            throw new Error(
              'Generated question is too similar to the question history'
            );
          }

          accepted.push(combined);
        }

        const review = reviewSchema.safeParse(
          await groqJson(
            'You are an independent, strict assessment quality reviewer. You did not write these questions. Review each numbered candidate against the supplied history. Check factual correctness, whether the marked answer is unambiguously the best answer, whether the explanation supports that answer, whether distractors create ambiguity, and whether it is a duplicate or close paraphrase of a historical question or another candidate. Do not repair or rewrite. Be conservative: reject uncertain, ambiguous, unsupported, or duplicate questions. Return JSON only: {"reviews":[{"id":1,"approved":true,"factually_supported":true,"unambiguous":true,"correct_answer_valid":true,"duplicate":false,"feedback":"..."}]}. Include exactly one review for each id 1..5.',
            JSON.stringify({
              candidates: candidates.map((candidate, index) => ({
                id: index + 1,
                ...candidate,
              })),
              recentQuestionHistory: historyText.slice(0, 50),
            })
          )
        );

        if (!review.success) {
          const reviewErrors = review.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ');
          throw new Error(
            `Independent question review response was invalid: ${reviewErrors}`
          );
        }

        const verdicts = [...review.data.reviews].sort(
          (a, b) => a.id - b.id
        );

        if (verdicts.map((verdict) => verdict.id).join(',') !== '1,2,3,4,5') {
          throw new Error(
            'Independent reviewer did not return exactly one verdict for each question'
          );
        }

        const rejected = verdicts.filter(
          (verdict) =>
            !verdict.approved ||
            !verdict.factually_supported ||
            !verdict.unambiguous ||
            !verdict.correct_answer_valid ||
            verdict.duplicate
        );

        if (rejected.length) {
          throw new Error(
            'Independent reviewer rejected one or more questions: ' +
              rejected
                .map((verdict) => `Q${verdict.id}: ${verdict.feedback}`)
                .join(' | ')
          );
        }

        approvedCandidates = candidates;
        attemptsUsed = attempt;
        break;
      } catch (error) {
        rejectionFeedback =
          error instanceof Error ? error.message : String(error);

        console.warn('Daily challenge generation attempt failed', {
          date,
          attempt,
          maxAttempts: MAX_GENERATION_ATTEMPTS,
          reason: rejectionFeedback,
        });

        if (attempt === MAX_GENERATION_ATTEMPTS) {
          throw new Error(
            `Daily challenge generation failed after ${MAX_GENERATION_ATTEMPTS} attempts. Last error: ${rejectionFeedback}`
          );
        }
      }
    }

    if (!approvedCandidates) {
      throw new Error(
        'Daily challenge generation did not produce an approved question set'
      );
    }

    const ids: number[] = [];

    for (let index = 0; index < approvedCandidates.length; index += 1) {
      const candidate = approvedCandidates[index];
      const code = `AI-${date.replaceAll('-', '')}-${index + 1}`;
      const hash = fingerprint(candidate);

      const row = await sql`
        INSERT INTO questions (
          question_code,
          category,
          difficulty,
          question_type,
          prompt,
          scenario,
          options,
          correct_option,
          explanation,
          learning_objective,
          source_name,
          status,
          content_fingerprint,
          quality_reviewed_at,
          quality_review_model
        )
        VALUES (
          ${code},
          ${candidate.category},
          ${candidate.difficulty},
          'scenario',
          ${candidate.prompt},
          ${candidate.scenario},
          ${JSON.stringify(candidate.options)},
          ${candidate.correct_option},
          ${candidate.explanation},
          ${candidate.learning_objective},
          'Groq AI - independently reviewed',
          'approved',
          ${hash},
          NOW(),
          ${process.env.GROQ_MODEL || 'openai/gpt-oss-120b'}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      if (!row.length) {
        throw new Error(
          'A generated question matched a previously stored fingerprint'
        );
      }

      ids.push(Number(row[0].id));
    }

    const challenge = await sql`
      INSERT INTO daily_challenges (challenge_date, status)
      VALUES (${date}::date, 'scheduled')
      RETURNING id
    `;

    for (let index = 0; index < ids.length; index += 1) {
      await sql`
        INSERT INTO daily_challenge_questions (
          challenge_id,
          question_id,
          position,
          points
        )
        VALUES (${challenge[0].id}, ${ids[index]}, ${index + 1}, 2)
      `;
    }

    await sql`
      UPDATE daily_challenges
      SET status = 'published'
      WHERE id = ${challenge[0].id}
    `;

    await sql`
      UPDATE question_generation_runs
      SET
        status = 'published',
        error_message = NULL,
        completed_at = NOW()
      WHERE challenge_date = ${date}::date
    `;

    const cleanup = await runOldChallengeCleanup(date);

    return NextResponse.json(
      {
        ok: true,
        date,
        challengeId: Number(challenge[0].id),
        questionCount: ids.length,
        qualityReview: 'passed',
        attemptsUsed,
        reviewModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        cleanup,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error('Daily challenge generation failed:', error);

    try {
      await sql`
        UPDATE question_generation_runs
        SET
          status = 'failed',
          error_message = ${errorMessage.slice(0, 1000)},
          completed_at = NOW()
        WHERE challenge_date = ${date}::date
      `;
    } catch (loggingError) {
      console.error('Failed to save generation error:', loggingError);
    }

    return NextResponse.json(
      {
        error: 'Generation or independent validation failed.',
        message: errorMessage,
      },
      { status: 502 }
    );
  }
}

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}
