import { z } from 'zod';
export const registerSchema = z.object({ username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/), password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128) }).refine(v => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
export const loginSchema = z.object({ username: z.string().trim().min(3).max(32), password: z.string().min(1).max(128) });
// Neon/PostgreSQL BIGSERIAL values may be serialized as strings by the driver.
// Accept either a positive integer or a numeric string, then normalize to number.
const questionIdSchema = z.union([
  z.number().int().positive(),
  z.string().trim().regex(/^\d+$/).transform(Number),
]).pipe(z.number().int().positive());
export const answerSchema = z.object({
  questionId: questionIdSchema,
  option: z.string().trim().min(1).max(8).transform((value) => value.toUpperCase()),
});
export const questionSchema = z.object({ questionCode: z.string().min(3).max(40), category: z.string().min(2).max(40), difficulty: z.enum(['easy','medium','hard']), questionType: z.enum(['scenario','debugging','case-study','problem-solving','concept-application']), prompt: z.string().min(30).max(5000), scenario: z.string().max(5000).optional().nullable(), options: z.array(z.object({id:z.string().min(1).max(8),text:z.string().min(1).max(500)})).length(4), correctOption: z.string().min(1).max(8), explanation: z.string().min(30).max(5000), learningObjective: z.string().optional().nullable(), sourceName: z.string().optional().nullable(), sourceUrl: z.string().url().optional().nullable().or(z.literal('')), status: z.enum(['draft','approved','archived']).default('draft') }).refine(v => v.options.some(o => o.id === v.correctOption), {message:'Correct option must exist in options'});
