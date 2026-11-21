# TECHNOVA HUB — Invalid Answer Hotfix

## Root cause
The challenge submit API used a strict Zod schema requiring `questionId` to be a JavaScript number. PostgreSQL `BIGSERIAL` identifiers can be serialized by the Neon driver as strings in some query paths. The browser then submitted a numeric string (for example, `"125"`) and the API rejected it with the generic `Invalid answer` response before checking the selected option.

## Changes
- `lib/validation.ts`: accept either a positive integer or a numeric string for `questionId`, normalize to a number, and trim/uppercase the selected option ID.
- `lib/challenge.ts`: normalize `question_id`, `position`, and `points` to numbers before returning the daily challenge JSON.
- `app/api/challenge/submit/route.ts`: return actionable validation details, load the saved options, reject only option IDs that are not actually present in that question, and compare normalized option IDs case-insensitively.

## Apply and verify
1. Replace the deployed project with this ZIP (or copy the three modified source files into the existing working tree).
2. Run `npm ci`, then `npm run typecheck` and `npm run build` locally.
3. Deploy to Vercel Production.
4. Sign in, open today's challenge, select one answer, and confirm that the result shows Correct/Not quite plus the explanation. Confirm the attempt appears in Admin → Activity.

No database migration is required. No existing database records are changed by this hotfix.
