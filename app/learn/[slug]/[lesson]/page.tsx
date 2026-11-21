import Link from 'next/link';
import {notFound} from 'next/navigation';
import {learningPaths} from '@/lib/learning';
import {getSession} from '@/lib/auth';
import {isLessonUnlocked} from '@/lib/learning-server';
import {getPracticalTask} from '@/lib/learning-assessments';
import AiTutor from '../../ai-tutor';
import LessonAssessment from '../../lesson-assessment';

export function generateStaticParams(){return learningPaths.flatMap(path=>path.lessons.map(lesson=>({slug:path.slug,lesson:lesson.slug})));}
export default async function LessonPage({params}:{params:Promise<{slug:string;lesson:string}>}){
 const {slug,lesson:lessonSlug}=await params;const path=learningPaths.find(item=>item.slug===slug);const index=path?.lessons.findIndex(item=>item.slug===lessonSlug)??-1;if(!path||index<0)notFound();
 const lesson=path.lessons[index];const previous=path.lessons[index-1];const next=path.lessons[index+1];const session=await getSession();const signedIn=session?.role==='participant';
 const unlocked=signedIn?await isLessonUnlocked(Number(session.sub),path.slug,lesson.slug):false;
 const context=[...lesson.body,...lesson.takeaways.map(item=>`Key takeaway: ${item}`),lesson.code?`Code example:\n${lesson.code}`:''].filter(Boolean).join('\n\n');
 return <main className="wrap"><nav className="nav"><Link className="brand" href="/">TECHNOVA<span> HUB</span></Link><div className="links"><Link href="/learn">Learning Hub</Link><Link href="/profile">Dashboard</Link><Link href="/certificates">Certificates</Link></div></nav><article className="lesson-content"><Link className="back-link" href={`/learn/${path.slug}`}>← {path.title}</Link><div className="eyebrow">LESSON {index+1} OF {path.lessons.length}</div><h1 className="page-title">{lesson.title}</h1><p className="lead">{lesson.summary}</p>
 {!signedIn?<div className="panel locked-lesson"><h2>Sign in to start this lesson</h2><p className="muted">Your checkpoint results, practical evidence and progress are saved to your TECHNOVA account.</p><Link className="btn" href="/">Go to sign in / registration</Link></div>:!unlocked?<div className="panel locked-lesson"><span className="pill">LESSON LOCKED</span><h2>Complete the previous lesson first</h2><p className="muted">To unlock this lesson, pass the previous checkpoint with at least 80% and submit accepted practical evidence. The server checks both records in Neon.</p>{previous&&<Link className="btn" href={`/learn/${path.slug}/${previous.slug}`}>Return to {previous.title} →</Link>}</div>:<>
 {lesson.body.map((paragraph,i)=><p className="lesson-paragraph" key={i}>{paragraph}</p>)}{lesson.code&&<pre className="code-sample"><code>{lesson.code}</code></pre>}<div className="panel takeaways"><h2>Key takeaways</h2><ul>{lesson.takeaways.map(item=><li key={item}>{item}</li>)}</ul></div>
 <LessonAssessment pathSlug={path.slug} lessonSlug={lesson.slug} nextLessonSlug={next?.slug} task={getPracticalTask(path.slug,lesson.slug)!}/>
 <AiTutor title={lesson.title} summary={lesson.summary} context={context}/>
 </>}
 <div className="lesson-navigation">{previous?<Link className="btn secondary" href={`/learn/${path.slug}/${previous.slug}`}>← Previous</Link>:<span/>}{next?<Link className="btn secondary" href={`/learn/${path.slug}/${next.slug}`}>Next lesson (locked until complete) →</Link>:<Link className="btn secondary" href={`/learn/${path.slug}`}>Back to learning path →</Link>}</div></article></main>
}
