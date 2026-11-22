import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {sql} from '@/lib/db';
import {tanzaniaDate} from '@/lib/dates';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const option=z.object({id:z.enum(['A','B','C','D']),text:z.string().trim().min(3).max(300)});
const question=z.object({category:z.string().trim().min(2).max(40),difficulty:z.enum(['easy','medium','hard']),prompt:z.string().trim().min(35).max(600),scenario:z.string().trim().max(700).nullable(),options:z.array(option).length(4),correct_option:z.enum(['A','B','C','D']),explanation:z.string().trim().min(40).max(800),learning_objective:z.string().trim().min(8).max(240)}).refine(q=>new Set(q.options.map(o=>o.id)).size===4).refine(q=>new Set(q.options.map(o=>normalise(o.text))).size===4);
const payloadSchema=z.object({questions:z.array(question).length(5)});
const reviewSchema=z.object({reviews:z.array(z.object({id:z.number().int().min(1).max(5),approved:z.boolean(),factually_supported:z.boolean(),unambiguous:z.boolean(),correct_answer_valid:z.boolean(),duplicate:z.boolean(),feedback:z.string().max(500)})).length(5)});
type Candidate=z.infer<typeof question>;

function normalise(value:string){return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
const stopWords=new Set(['the','and','for','that','with','from','this','what','when','where','which','your','you','are','can','how','does','use','using','about','into','should','would','could','will','their','they','them','than','then','have','has','was','were','its','not','one','two','three','after','before','best','most','more','less','why','who','all','any','does','did','doesnt','is','in','on','to','of','a','an','or','as','by','it','be','if','at']);
function terms(value:string){return normalise(value).split(' ').filter(token=>token.length>2&&!stopWords.has(token));}
function shingles(value:string){const list=terms(value);const out=new Set<string>();for(let i=0;i<list.length;i++){out.add(list[i]);if(i+1<list.length)out.add(`${list[i]}_${list[i+1]}`);}return out;}
function overlap(a:string,b:string){const x=shingles(a),y=shingles(b);if(!x.size||!y.size)return 0;let common=0;for(const token of x)if(y.has(token))common++;return common/(x.size+y.size-common);}
function fingerprint(q:Candidate){return createHash('sha256').update(normalise([q.category,q.prompt,q.scenario??'',...q.options.map(o=>o.text)].join(' '))).digest('hex');}
function uniqueQuestion(q:Candidate){const optionTexts=q.options.map(o=>normalise(o.text));return new Set(q.options.map(o=>o.id)).size===4&&new Set(optionTexts).size===4&&q.options.every(o=>o.text.trim().length>=3)&&Boolean(q.options.find(o=>o.id===q.correct_option));}

async function groqJson(system:string,user:string){
 const apiKey=process.env.GROQ_API_KEY;if(!apiKey)throw new Error('GROQ_API_KEY is missing');
 const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'openai/gpt-oss-120b',temperature:0.1,max_tokens:4000,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:user}]}),signal:AbortSignal.timeout(25000)});
 if(!response.ok){const detail=await response.text();throw new Error(`Groq returned ${response.status}: ${detail.slice(0,250)}`);}
 const payload:unknown=await response.json();const choices=payload&&typeof payload==='object'&&'choices'in payload&&Array.isArray(payload.choices)?payload.choices:[];const first=choices[0];const message=first&&typeof first==='object'&&'message'in first?first.message:null;const content=message&&typeof message==='object'&&'content'in message?message.content:null;if(typeof content!=='string')throw new Error('Groq returned no JSON content');return JSON.parse(content) as unknown;
}

async function run(req:Request){
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({error:'Unauthorized'},{status:401});
 const date=tanzaniaDate();
 try{
  const prior=await sql`SELECT id,status,(SELECT COUNT(*)::int FROM daily_challenge_questions WHERE challenge_id=daily_challenges.id) AS question_count FROM daily_challenges WHERE challenge_date=${date}::date LIMIT 1`;
  if(prior[0]?.status==='published')return NextResponse.json({ok:true,date,message:'Challenge already published'});
  if(prior[0]?.status==='scheduled'&&Number(prior[0].question_count)===5){await sql`UPDATE daily_challenges SET status='published' WHERE id=${prior[0].id}`;await sql`UPDATE question_generation_runs SET status='published',completed_at=NOW() WHERE challenge_date=${date}::date`;return NextResponse.json({ok:true,date,message:'Recovered and published the prepared challenge'});}
  if(prior.length)await sql`DELETE FROM daily_challenges WHERE id=${prior[0].id}`;
  const lock=await sql`INSERT INTO question_generation_runs(challenge_date,status) VALUES(${date}::date,'started') ON CONFLICT(challenge_date) DO UPDATE SET status='started',created_at=NOW(),completed_at=NULL WHERE question_generation_runs.status='failed' OR question_generation_runs.created_at<NOW()-INTERVAL '20 minutes' RETURNING id`;
  if(!lock.length)return NextResponse.json({ok:true,date,message:'Generation is already running or complete'});
  await sql`DELETE FROM questions WHERE question_code LIKE ${'AI-'+date.replaceAll('-','')+'-%'} AND NOT EXISTS(SELECT 1 FROM daily_challenge_questions WHERE daily_challenge_questions.question_id=questions.id)`;

  const generated=payloadSchema.safeParse(await groqJson(
   'You are TECHNOVA HUB assessment author. Return JSON only with exactly five accurate, original technology questions. Each question has category, difficulty, prompt, scenario, four distinct options A-D, correct_option, explanation and learning_objective. Questions must have one defensible correct answer. Prefer clear beginner-friendly scenarios. Cover different areas: programming, web development, defensive cybersecurity, AI, databases, networking and computer science. Never create dangerous cyber instructions. Do not rely on facts that change frequently.',
   `Create five varied questions for ${date}. Avoid recycled generic stems. Questions should test understanding, not trivia. Return exactly {"questions":[...]}.`
  ));
  if(!generated.success)throw new Error('Generated questions failed structural validation');
  const candidates=generated.data.questions;
  if(candidates.some(q=>!uniqueQuestion(q)))throw new Error('A question contains duplicate or invalid answer options');
  if(new Set(candidates.map(q=>normalise(q.category))).size<3)throw new Error('The daily set must cover at least three distinct technology categories');
  const history=await sql`SELECT prompt,scenario,options FROM questions WHERE created_at>NOW()-INTERVAL '365 days' ORDER BY created_at DESC LIMIT 600`;
  const historyText=history.map((r,i)=>({id:i+1,prompt:String(r.prompt),scenario:String(r.scenario??''),options:Array.isArray(r.options)?r.options:[]}));
  const accepted:string[]=[];
  for(const candidate of candidates){
   const combined=[candidate.prompt,candidate.scenario??'',...candidate.options.map(o=>o.text)].join(' ');
   if(accepted.some(previous=>overlap(previous,combined)>=0.40))throw new Error('Generated questions are too similar to one another');
   if(history.some(old=>overlap(combined,[String(old.prompt),String(old.scenario??''),JSON.stringify(old.options)].join(' '))>=0.48))throw new Error('Generated question is too similar to the question history');
   accepted.push(combined);
  }
  const review=reviewSchema.safeParse(await groqJson(
   'You are an independent, strict assessment quality reviewer. You did not write these questions. Review each numbered candidate against the supplied history. Check factual correctness, whether the marked answer is unambiguously the best answer, whether the explanation supports that answer, whether distractors create ambiguity, and whether it is a duplicate or close paraphrase of a historical question or another candidate. Do not repair or rewrite. Be conservative: reject uncertain, ambiguous, unsupported, or duplicate questions. Return JSON only: {"reviews":[{"id":1,"approved":true,"factually_supported":true,"unambiguous":true,"correct_answer_valid":true,"duplicate":false,"feedback":"..."}]}. Include exactly one review for each id 1..5.',
   JSON.stringify({candidates:candidates.map((q,i)=>({id:i+1,...q})),recentQuestionHistory:historyText.slice(0,160)})
  ));
  if(!review.success)throw new Error('Independent question review response was invalid');
  const verdicts=review.data.reviews.sort((a,b)=>a.id-b.id);
  if(verdicts.map(v=>v.id).join(',')!=='1,2,3,4,5')throw new Error('Independent reviewer did not return exactly one verdict for each question');
  if(verdicts.some(v=>!v.approved||!v.factually_supported||!v.unambiguous||!v.correct_answer_valid||v.duplicate))throw new Error('Independent reviewer rejected one or more questions: '+verdicts.filter(v=>!v.approved||!v.factually_supported||!v.unambiguous||!v.correct_answer_valid||v.duplicate).map(v=>`Q${v.id}: ${v.feedback}`).join(' | '));

  const ids:number[]=[];
  for(let i=0;i<candidates.length;i++){
   const q=candidates[i];const code=`AI-${date.replaceAll('-','')}-${i+1}`;const hash=fingerprint(q);
   const row=await sql`INSERT INTO questions(question_code,category,difficulty,question_type,prompt,scenario,options,correct_option,explanation,learning_objective,source_name,status,content_fingerprint,quality_reviewed_at,quality_review_model) VALUES(${code},${q.category},${q.difficulty},'scenario',${q.prompt},${q.scenario},${JSON.stringify(q.options)},${q.correct_option},${q.explanation},${q.learning_objective},'Groq AI - independently reviewed','approved',${hash},NOW(),${process.env.GROQ_MODEL||'openai/gpt-oss-120b'}) ON CONFLICT DO NOTHING RETURNING id`;
   if(!row.length)throw new Error('A generated question matched a previously stored fingerprint');ids.push(Number(row[0].id));
  }
  const challenge=await sql`INSERT INTO daily_challenges(challenge_date,status) VALUES(${date}::date,'scheduled') RETURNING id`;
  for(let i=0;i<ids.length;i++)await sql`INSERT INTO daily_challenge_questions(challenge_id,question_id,position,points) VALUES(${challenge[0].id},${ids[i]},${i+1},2)`;
  await sql`UPDATE daily_challenges SET status='published' WHERE id=${challenge[0].id}`;
  await sql`UPDATE question_generation_runs SET status='published',completed_at=NOW() WHERE challenge_date=${date}::date`;
  return NextResponse.json({ok:true,date,challengeId:Number(challenge[0].id),questionCount:ids.length,qualityReview:'passed',reviewModel:process.env.GROQ_MODEL||'openai/gpt-oss-120b'},{status:201});
 
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
}}

export async function POST(req:Request){return run(req)}
export async function GET(req:Request){return run(req)}
