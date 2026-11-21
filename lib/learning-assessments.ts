import { learningPaths } from '@/lib/learning';
import { checkpointQuizBank, type CheckpointQuestionSpec } from '@/lib/learning-quiz-bank';

export type QuizOption = { id: 'A' | 'B' | 'C' | 'D'; text: string };
export type QuizQuestion = { id: string; prompt: string; options: QuizOption[]; correctOption: QuizOption['id']; explanation: string };
export type PublicQuizQuestion = Omit<QuizQuestion, 'correctOption' | 'explanation'>;
export type Requirement = { label: string; anyOf: string[] };
export type PracticalTask = { title: string; instructions: string; deliverable: string; requirements: Requirement[] };

const taskMap: Record<string, PracticalTask> = {
  'how-the-web-works': { title: 'Trace a web request', instructions: 'Create a short diagram or explanation showing what happens after a learner enters a website address. Include the browser, DNS, server, HTTP request and response.', deliverable: 'Paste your flow diagram or explanation. It must describe the order of events, not just list the terms.', requirements: [{label:'Explain the browser and server roles',anyOf:['browser','client']},{label:'Show DNS name resolution',anyOf:['dns']},{label:'Include an HTTP request',anyOf:['http request','request']},{label:'Include the server response',anyOf:['response']},{label:'Describe how the page is rendered',anyOf:['render','html','display the page']} ] },
  'semantic-html': { title: 'Build a semantic page', instructions: 'Write a small HTML page for a learning article. Use semantic elements and a logical heading structure.', deliverable: 'Paste the HTML source code.', requirements: [{label:'Use a main landmark',anyOf:['<main']},{label:'Use an article or section',anyOf:['<article','<section']},{label:'Use a top-level heading',anyOf:['<h1']},{label:'Use a meaningful navigation or header element',anyOf:['<nav','<header']},{label:'Use paragraph or list content',anyOf:['<p','<ul','<ol']} ] },
  'variables-and-types': { title: 'Create a typed-value example', instructions: 'Write a small JavaScript example that stores a learner name, a lesson count and an active flag. Use modern variable declarations.', deliverable: 'Paste your JavaScript code and briefly state what each value represents.', requirements: [{label:'Declare a value with const',anyOf:['const ']},{label:'Declare a reassignable value with let',anyOf:['let ']},{label:'Include a string value',anyOf:['string','"','\'']},{label:'Include a numeric value',anyOf:['number','= 1','= 2','= 3']},{label:'Include a boolean value',anyOf:['true','false','boolean']} ] },
  'functions': { title: 'Write a reusable function', instructions: 'Create a function that calculates an average or performs another small task. Handle an invalid or empty input and return a result.', deliverable: 'Paste the function and show one example call.', requirements: [{label:'Declare a function',anyOf:['function ','=>']},{label:'Accept input parameters',anyOf:['(']},{label:'Return a result',anyOf:['return ']},{label:'Handle an edge case',anyOf:['if ','<=','===','!']},{label:'Show an example function call',anyOf:['(']} ] },
  'relational-model': { title: 'Design related database tables', instructions: 'Sketch two related tables for learners and courses. Identify the primary key and the foreign-key relationship, then mention one useful constraint.', deliverable: 'Paste SQL or a clear table design.', requirements: [{label:'Define a table or relation',anyOf:['create table','table']},{label:'Identify a primary key',anyOf:['primary key']},{label:'Identify a foreign key',anyOf:['foreign key','references']},{label:'Explain a relationship',anyOf:['one-to-many','one to many','relationship','relates']},{label:'Include a data integrity constraint',anyOf:['unique','not null','check constraint','constraint']} ] },
  'safe-queries': { title: 'Prevent SQL injection', instructions: 'Write a safe SQL query that finds a user by username using a parameter placeholder. Explain why the parameter is kept separate from SQL text.', deliverable: 'Paste the query and a short explanation.', requirements: [{label:'Use a SELECT query',anyOf:['select ']},{label:'Use a WHERE condition',anyOf:['where ']},{label:'Use a parameter placeholder',anyOf:['$1','?']},{label:'Mention parameterized queries',anyOf:['parameterized','parameterised','bound parameter']},{label:'Explain SQL injection prevention',anyOf:['sql injection','injection']} ] },
  'account-security': { title: 'Create an account-protection plan', instructions: 'Write a short security checklist for a student account. Cover password hygiene, multi-factor authentication and safe recovery.', deliverable: 'Paste your checklist and explain why each control matters.', requirements: [{label:'Recommend unique passwords',anyOf:['unique password','password manager']},{label:'Mention MFA or two-factor authentication',anyOf:['mfa','two-factor','2fa','multi-factor']},{label:'Explain secure password hashing',anyOf:['bcrypt','argon2','password hash','hashing']},{label:'Protect recovery codes',anyOf:['recovery code','recovery codes']},{label:'Avoid sharing one-time passwords',anyOf:['otp','one-time password','one time password']} ] },
  'phishing-awareness': { title: 'Analyse a suspicious message', instructions: 'Describe how you would investigate a message that urgently asks you to open an attachment and sign in. Do not open the attachment or follow its link.', deliverable: 'Paste a safe response plan. Do not include real credentials or private information.', requirements: [{label:'Identify urgency or pressure',anyOf:['urgency','urgent','pressure','threat']},{label:'Check the actual sender domain',anyOf:['domain','sender address']},{label:'Treat unexpected attachments or links as suspicious',anyOf:['attachment','link']},{label:'Verify independently using a trusted channel',anyOf:['independent','official website','trusted channel','contact support']},{label:'Do not submit credentials through the message link',anyOf:['password','credentials','sign in']} ] },
  'model-basics': { title: 'Explain a model lifecycle', instructions: 'Use a simple example to distinguish model training from inference. Add one way to evaluate whether its output is reliable.', deliverable: 'Paste your explanation using your own example.', requirements: [{label:'Explain training',anyOf:['training']},{label:'Explain inference',anyOf:['inference']},{label:'Describe example data or patterns',anyOf:['data','example']},{label:'Mention evaluation or testing',anyOf:['evaluate','evaluation','test']},{label:'Recognise a limitation or possible error',anyOf:['bias','limitation','error','fail']} ] },
  'html-forms': { title: 'Build an accessible form', instructions: 'Write a small registration form with a labelled email field and a required submit control.', deliverable: 'Paste the HTML source.', requirements: [{label:'Use a form element',anyOf:['<form']},{label:'Connect a label with its input',anyOf:['<label','for=']},{label:'Use an email input type',anyOf:['type="email"',"type='email'"]},{label:'Mark a field required',anyOf:['required']},{label:'Use a submit button',anyOf:['type="submit"',"type='submit'",'<button']} ] },
  'css-layout': { title: 'Create a responsive layout', instructions: 'Write CSS for a card layout using Flexbox or Grid and include a responsive adjustment for small screens.', deliverable: 'Paste your CSS code.', requirements: [{label:'Use CSS Grid or Flexbox',anyOf:['display: grid','display:grid','display: flex','display:flex']},{label:'Define spacing between items',anyOf:['gap:']},{label:'Use a responsive media query',anyOf:['@media']},{label:'Adapt layout for smaller screens',anyOf:['max-width','min-width','auto-fit','auto-fill']},{label:'Avoid a rigid fixed page width',anyOf:['width: 100%','max-width','minmax(']} ] },
  'components-and-props': { title: 'Create a reusable React component', instructions: 'Write a typed React component that receives a learner name as a prop and displays a greeting.', deliverable: 'Paste the TypeScript/React component.', requirements: [{label:'Declare a React component',anyOf:['function ','const ']},{label:'Accept props or a props type',anyOf:['props','props =','greetingprops']},{label:'Use a TypeScript type or interface',anyOf:['type ','interface ']},{label:'Render JSX',anyOf:['return','<h1','<div']},{label:'Use the passed name prop',anyOf:['name']} ] },
  'state-and-events': { title: 'Build an interactive counter', instructions: 'Create a React counter using useState and an event handler that increments the count when a button is clicked.', deliverable: 'Paste the component code.', requirements: [{label:'Use useState',anyOf:['usestate']},{label:'Create a state setter',anyOf:['setcount','setvalue']},{label:'Define an event handler',anyOf:['onclick','on click','function handle','=>']},{label:'Update state from its previous value',anyOf:['value + 1','count + 1','prev + 1','previous + 1']},{label:'Render a button',anyOf:['<button']} ] },
  'app-router': { title: 'Map an App Router route', instructions: 'Sketch a Next.js App Router folder structure for a course page and a dynamic lesson route. Explain which file renders each page.', deliverable: 'Paste the folder tree and explanation.', requirements: [{label:'Show the app directory',anyOf:['app/']},{label:'Include page.tsx',anyOf:['page.tsx']},{label:'Include a dynamic route segment',anyOf:['[slug]','[lesson]']},{label:'Explain URL segments or routing',anyOf:['route','url segment','routing']},{label:'Mention a layout file',anyOf:['layout.tsx']} ] },
  'server-client-components': { title: 'Choose server and client responsibilities', instructions: 'Write a short design note for a page that loads private data and includes a like button. Decide what belongs on the server and what needs client interaction.', deliverable: 'Paste your design note.', requirements: [{label:'Assign private data fetching to the server',anyOf:['server component','server-side','server']},{label:'Assign click interaction to a client component',anyOf:['client component','client-side','client']},{label:'Keep secrets on the server',anyOf:['secret','api key','credentials']},{label:'Mention state or event handling',anyOf:['state','event handler','onclick','interaction']},{label:'Avoid exposing privileged data to the browser',anyOf:['browser','frontend','expose']} ] },
  'algorithmic-thinking': { title: 'Plan and test an algorithm', instructions: 'Write pseudocode or code that finds the largest number in a list. Explain the input, output and what happens when the list is empty.', deliverable: 'Paste your algorithm and one test case.', requirements: [{label:'Describe the input collection',anyOf:['array','list','values']},{label:'Track a current largest value',anyOf:['largest','maximum','max']},{label:'Iterate through values',anyOf:['for ','while ','loop']},{label:'Compare values',anyOf:['>','greater']},{label:'Handle an empty list or edge case',anyOf:['empty','length === 0','length == 0','null']} ] },
  'arrays-and-objects': { title: 'Choose arrays and objects', instructions: 'Create a JavaScript object representing a learner with a name and an array of skills. Add one skill to the array.', deliverable: 'Paste the JavaScript code.', requirements: [{label:'Create an object',anyOf:['{']},{label:'Use a named property',anyOf:['name:','skills:']},{label:'Create an array',anyOf:['[']},{label:'Add an item to the array',anyOf:['.push(','push(']},{label:'Explain why the two structures are different',anyOf:['ordered','collection','property','key']} ] },
  'ip-and-dns': { title: 'Explain how a domain is reached', instructions: 'Describe how DNS helps a device find a service and distinguish private IP addresses from public IP addresses.', deliverable: 'Paste your explanation or a simple network diagram.', requirements: [{label:'Explain an IP address',anyOf:['ip address','ip-address']},{label:'Explain DNS resolution',anyOf:['dns']},{label:'Distinguish private addresses',anyOf:['private ip','private address']},{label:'Distinguish public addresses',anyOf:['public ip','public address']},{label:'Explain how the client finds a host or service',anyOf:['resolve','host','server']} ] },
  'http-https': { title: 'Compare HTTP and HTTPS', instructions: 'Show a simple HTTP request and response, then explain what HTTPS adds through TLS.', deliverable: 'Paste a short protocol example and explanation.', requirements: [{label:'Mention HTTP requests',anyOf:['http request','get ','post ','request']},{label:'Mention the response',anyOf:['response']},{label:'Distinguish HTTPS from HTTP',anyOf:['https']},{label:'Explain TLS protection',anyOf:['tls']},{label:'Mention confidentiality or integrity',anyOf:['confidentiality','integrity','encrypted','encryption']} ] },
};

function seedNumber(seed: string): number { let h = 2166136261; for (let i=0;i<seed.length;i++) { h ^= seed.charCodeAt(i); h = Math.imul(h,16777619); } return h >>> 0; }
function stableSort<T>(items: T[], seed: string, getText: (item:T)=>string): T[] { return [...items].sort((a,b)=>seedNumber(`${seed}:${getText(a)}`)-seedNumber(`${seed}:${getText(b)}`)); }
function distinctOptions(correct: string, distractors: string[], seed: string) {
  const unique = [...new Set([correct, ...stableSort(distractors.filter(x=>x!==correct),seed,x=>x)])].slice(0,4);
  while (unique.length < 4) unique.push(`Review the core ideas in ${seed.split(':')[0]}.`);
  return stableSort(unique,seed,x=>x).map((text,index)=>({id:(['A','B','C','D'] as const)[index],text}));
}

export function getLesson(pathSlug:string, lessonSlug:string) {
  const path = learningPaths.find(p=>p.slug===pathSlug);
  const lesson = path?.lessons.find(l=>l.slug===lessonSlug);
  return path && lesson ? {path,lesson,index:path.lessons.findIndex(l=>l.slug===lessonSlug)} : null;
}

export function buildLessonQuiz(pathSlug:string, lessonSlug:string, participantId:number): QuizQuestion[] {
  const found=getLesson(pathSlug,lessonSlug); if(!found) return [];
  const {lesson}=found; const seed=`${participantId}:${pathSlug}:${lessonSlug}`;
  const authored=checkpointQuizBank[lessonSlug];
  const concepts=[lesson.summary,...lesson.takeaways];
  const fallback:CheckpointQuestionSpec[]=Array.from({length:5},(_,index)=>{
    const correct=concepts[index%concepts.length]??lesson.summary;
    const distractors=concepts.filter(item=>item!==correct).slice(0,3);
    while(distractors.length<3)distractors.push(`A misconception about ${lesson.title.toLowerCase()} (${distractors.length+1})`);
    const prompt=index===0?`Which statement best describes “${lesson.title}”?`:`Which idea should guide your next step when applying ${lesson.title}?`;
    return [prompt,correct,distractors[0],distractors[1],distractors[2],`Review this key idea: ${correct}`];
  });
  const specs=authored??fallback;
  return specs.map((spec,index)=>{
    const [prompt,correct,d1,d2,d3,explanation]=spec;
    const options=distinctOptions(correct,[d1,d2,d3],`${seed}:q${index+1}`);
    return {id:`q${index+1}`,prompt,options,correctOption:options.find(o=>o.text===correct)!.id,explanation};
  });
}

export function getPublicQuiz(quiz:QuizQuestion[]):PublicQuizQuestion[]{return quiz.map(({correctOption:_c,explanation:_e,...q})=>q);}

export function buildFinalQuiz(pathSlug:string, participantId:number):QuizQuestion[] {
  const path=learningPaths.find(p=>p.slug===pathSlug); if(!path)return [];
  const banks=path.lessons.map(lesson=>buildLessonQuiz(pathSlug,lesson.slug,participantId)
    .map(q=>({...q,id:`${lesson.slug}:${q.id}`})));
  const chosen:QuizQuestion[]=[];
  // Round-robin through lessons so a short path is assessed across every lesson,
  // instead of taking most final questions from the first lesson in the path.
  for(let round=0;round<5&&chosen.length<5;round++){
    for(const bank of banks){
      if(bank[round]&&chosen.length<5)chosen.push(bank[round]);
    }
  }
  return chosen.map((q,index)=>({...q,id:`final-${index+1}`,prompt:`${q.prompt} (Final assessment)`}));
}

export function getPracticalTask(pathSlug:string,lessonSlug:string):PracticalTask|null {
  const found=getLesson(pathSlug,lessonSlug);if(!found)return null;
  return taskMap[lessonSlug]??{title:`Apply ${found.lesson.title}`,instructions:`Create a small example that demonstrates the main idea of ${found.lesson.title}. Use the lesson notes as your guide.`,deliverable:'Paste your work and explain how it demonstrates the lesson objectives.',requirements:found.lesson.takeaways.map((t,i)=>({label:t,anyOf:t.toLowerCase().split(/\W+/).filter(w=>w.length>4).slice(0,3)}))};
}

export function evaluatePractical(task:PracticalTask,evidence:string,reflection:string){
  const content=evidence.toLowerCase();
  const passedGroups=task.requirements.filter(group=>group.anyOf.some(term=>content.includes(term.toLowerCase())));
  const missing=task.requirements.filter(group=>!group.anyOf.some(term=>content.includes(term.toLowerCase()))).map(group=>group.label);
  const score=Math.round(passedGroups.length/task.requirements.length*100);
  const evidenceLongEnough=evidence.trim().length>=100;
  const reflectionLongEnough=reflection.trim().length>=40;
  const passed=score>=80&&evidenceLongEnough&&reflectionLongEnough;
  const feedback=passed
    ? 'Your submission meets the server-side practical rubric. Your evidence and reflection have been saved to your TECHNOVA account.'
    : [!evidenceLongEnough?'Add more concrete evidence (at least 100 characters).':'',!reflectionLongEnough?'Add a reflection of at least 40 characters explaining what you learned.':'',missing.length?`Still missing: ${missing.join('; ')}.`:'',score<80?'Meet at least 80% of the listed requirements and submit again.':''].filter(Boolean).join(' ');
  return {score,passed,feedback,missing};
}
