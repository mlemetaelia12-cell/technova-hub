'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Option = { id: string; text: string };
type Question = { id: number; question_code: string; category: string; difficulty: 'easy'|'medium'|'hard'; question_type: string; prompt: string; scenario: string|null; options: Option[]; correct_option: string; explanation: string; learning_objective: string|null; source_name: string|null; source_url: string|null; status: 'draft'|'approved'|'archived' };
type Participant = { public_id: string; display_name: string|null; anonymous: boolean; is_blocked: boolean; total_points: number; answered:number; correct:number };
type Challenge = { id: number; challenge_date: string; status: string; question_count: number };
type Activity = { id:number; action:string; detail:Record<string,unknown>|null; created_at:string };
type Attempt = { public_id:string; question_code:string; category:string; selected_option:string; is_correct:boolean; points:number; answered_at:string };
type QuestionInput = Omit<Question, 'id'>;
const blank: QuestionInput = { question_code:'', category:'Cybersecurity', difficulty:'medium', question_type:'scenario', prompt:'', scenario:'', options:[{id:'A',text:''},{id:'B',text:''},{id:'C',text:''},{id:'D',text:''}], correct_option:'A', explanation:'', learning_objective:'', source_name:'', source_url:'', status:'draft' };

export default function AdminDashboard() {
  const [tab,setTab]=useState('overview'), [questions,setQuestions]=useState<Question[]>([]), [participants,setParticipants]=useState<Participant[]>([]), [challenges,setChallenges]=useState<Challenge[]>([]);
  const [activity,setActivity]=useState<Activity[]>([]),[attempts,setAttempts]=useState<Attempt[]>([]);
  const [form,setForm]=useState<QuestionInput>(blank), [editingId,setEditingId]=useState<number|null>(null), [date,setDate]=useState(''), [ids,setIds]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false), [loadError,setLoadError]=useState('');
  async function load() {
    setLoadError('');
    try {
      const responses = await Promise.all(['/api/admin/questions','/api/admin/participants','/api/admin/challenges','/api/admin/activity'].map(url=>fetch(url,{cache:'no-store'})));
      if (responses.some(r=>r.status===401)) { window.location.assign('/admin/login'); return; }
      if (responses.some(r=>!r.ok)) throw new Error('Could not load all admin data.');
      const [q,p,c,a] = await Promise.all(responses.map(r=>r.json()));
      setQuestions(q.questions ?? []); setParticipants(p.participants ?? []); setChallenges(c.challenges ?? []); setActivity(a.audit ?? []); setAttempts(a.attempts ?? []);
    } catch { setLoadError('Unable to load admin data. Refresh and try again.'); }
  }
  useEffect(()=>{void load();},[]);
  async function saveQuestion() {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/admin/questions',{method:editingId?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editingId?{id:editingId,question:form}:form)});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Please review the question fields.');
      setMessage(editingId?'Question updated.':'Question created.');setForm(blank);setEditingId(null);await load();
    } catch(e) {setMessage(e instanceof Error?e.message:'Could not save question.');}
    finally{setBusy(false);}
  }
  async function removeQuestion(id:number) {
    if(!window.confirm('Delete this question? Questions already used in a challenge cannot be deleted.'))return;
    try {
      const response=await fetch('/api/admin/questions',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const data=await response.json();setMessage(response.ok?'Question deleted.':data.error??'Delete failed.');await load();
    } catch { setMessage('Network error. The question was not confirmed deleted.'); }
  }
  async function schedule() {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/admin/challenges',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,questionIds:ids.split(',').map(x=>Number(x.trim()))})});
      const data=await response.json();if(!response.ok)throw new Error(data.error??'Could not publish challenge.');
      setMessage('Challenge published.');setDate('');setIds('');await load();
    } catch(e){setMessage(e instanceof Error?e.message:'Could not publish challenge.');}
    finally{setBusy(false);}
  }
  async function changeChallengeStatus(challenge: Challenge) {
    const nextStatus = challenge.status === 'published' ? 'scheduled' : 'published';
    if (!window.confirm(`${nextStatus === 'published' ? 'Publish' : 'Unpublish'} this challenge?`)) return;
    try {
      const response = await fetch('/api/admin/challenges', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: challenge.id, status: nextStatus }) });
      const data = await response.json();
      setMessage(response.ok ? `Challenge ${nextStatus}.` : data.error ?? 'Could not change challenge status.');
      await load();
    } catch { setMessage('Network error. Challenge status was not confirmed.'); }
  }
  async function toggleBlock(p:Participant) {
    const action = p.is_blocked ? 'unblock' : 'block';
    if (!window.confirm(`Are you sure you want to ${action} ${p.public_id}?`)) return;
    try {
      const response=await fetch('/api/admin/participants',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicId:p.public_id,isBlocked:!p.is_blocked})});
      const data=await response.json();setMessage(response.ok?'Participant status updated.':data.error??'Could not update participant.');await load();
    } catch { setMessage('Network error. Participant status was not confirmed.'); }
  }
  async function logout(){await fetch('/api/admin/logout',{method:'POST'});window.location.assign('/admin/login');}
  function edit(q:Question){setEditingId(q.id);setForm({question_code:q.question_code,category:q.category,difficulty:q.difficulty,question_type:q.question_type,prompt:q.prompt,scenario:q.scenario??'',options:q.options,correct_option:q.correct_option,explanation:q.explanation,learning_objective:q.learning_objective??'',source_name:q.source_name??'',source_url:q.source_url??'',status:q.status});setTab('questions');}
  return <main className="wrap"><nav className="nav"><Link className="brand" href="/">TECHNOVA<span> HUB</span><small className="admin-mark">ADMIN</small></Link><button className="btn secondary" onClick={()=>void logout()}>Sign out</button></nav><section className="section"><div className="eyebrow">PRIVATE CONTROL CENTER</div><h1 className="page-title">Admin workspace</h1><p className="muted">Manage the question bank, publish challenges and moderate participants.</p>
    <div className="tabs">{['overview','questions','schedule','participants','activity'].map(t=><button key={t} className={'tab '+(tab===t?'active':'')} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {loadError&&<p className="error-state" role="alert">{loadError}</p>}{message&&<p className="notice" role="status">{message}</p>}
    {tab==='overview'&&<div className="stat-grid"><article className="panel"><span className="small">Question bank</span><div className="stat">{questions.length}</div></article><article className="panel"><span className="small">Participants</span><div className="stat">{participants.length}</div></article><article className="panel"><span className="small">Scheduled challenges</span><div className="stat">{challenges.length}</div></article></div>}
    {tab==='questions'&&<div className="panel"><h2>{editingId?'Edit question':'Create a question'}</h2><div className="form-grid">{(['question_code','category','prompt','scenario','explanation','learning_objective','source_name','source_url'] as const).map(k=><label className="field-label" key={k}>{k.replaceAll('_',' ')}<textarea className="input" rows={['prompt','scenario','explanation'].includes(k)?3:1} value={form[k]??''} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))}/></label>)}</div><div className="form-grid">{form.options.map((o,i)=><label className="field-label" key={o.id}>Option {o.id}<input className="input" value={o.text} onChange={e=>setForm(p=>({...p,options:p.options.map((v,j)=>i===j?{...v,text:e.target.value}:v)}))}/></label>)}</div><div className="form-grid"><label className="field-label">Correct option<select className="input" value={form.correct_option} onChange={e=>setForm(p=>({...p,correct_option:e.target.value}))}>{['A','B','C','D'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field-label">Difficulty<select className="input" value={form.difficulty} onChange={e=>setForm(p=>({...p,difficulty:e.target.value as QuestionInput['difficulty']}))}>{['easy','medium','hard'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field-label">Question type<select className="input" value={form.question_type} onChange={e=>setForm(p=>({...p,question_type:e.target.value}))}>{['scenario','debugging','case-study','problem-solving','concept-application'].map(x=><option key={x}>{x}</option>)}</select></label><label className="field-label">Status<select className="input" value={form.status} onChange={e=>setForm(p=>({...p,status:e.target.value as QuestionInput['status']}))}>{['draft','approved','archived'].map(x=><option key={x}>{x}</option>)}</select></label></div><div className="actions"><button className="btn" disabled={busy} onClick={()=>void saveQuestion()}>{busy?'Saving…':editingId?'Update question':'Save question'}</button>{editingId&&<button className="btn secondary" onClick={()=>{setEditingId(null);setForm(blank);}}>Cancel edit</button>}</div><h3>Question bank</h3><div className="table-scroll"><table className="table"><thead><tr><th>Question ID</th><th>Code</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{questions.map(q=><tr key={q.id}><td><strong>{q.id}</strong></td><td>{q.question_code}</td><td>{q.category}</td><td>{q.status}</td><td><button className="btn compact secondary" onClick={()=>edit(q)}>Edit</button> <button className="btn compact danger" onClick={()=>void removeQuestion(q.id)}>Delete</button></td></tr>)}</tbody></table></div></div>}
    {tab==='schedule'&&<div className="panel"><h2>Schedule a challenge manually</h2><p className="muted">Choose a date and five approved, unused questions. The challenge is saved now for the selected date and becomes visible to learners on that Tanzania-local date. For automatic AI-generated daily challenges, the Vercel Cron job handles generation separately.</p><label className="field-label">Challenge date (Tanzania time)<input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="field-label">Five numeric Question IDs, comma separated<input className="input" placeholder="12, 13, 14, 15, 16" value={ids} onChange={e=>setIds(e.target.value)}/></label><p className="muted">Find the numeric IDs in the Questions tab under the “Question ID” column. Select five questions with status <strong>approved</strong>. Do not enter the AI question code (for example, AI-20261121-1) in this field.</p><button className="btn" disabled={busy||!date||!ids} onClick={()=>void schedule()}>{busy?'Saving…':'Schedule challenge'}</button><div className="table-scroll"><table className="table"><thead><tr><th>Date</th><th>Status</th><th>Questions</th><th>Action</th></tr></thead><tbody>{challenges.map(c=><tr key={c.id}><td>{String(c.challenge_date).slice(0,10)}</td><td>{c.status}</td><td>{c.question_count}/5</td><td>{c.status !== 'closed' && <button className="btn compact secondary" onClick={()=>void changeChallengeStatus(c)}>{c.status === 'published' ? 'Unpublish' : 'Publish'}</button>}</td></tr>)}</tbody></table></div></div>}
    {tab==='activity'&&<div className="panel"><h2>Platform activity</h2><h3>Recent challenge attempts</h3><div className="table-scroll"><table className="table"><thead><tr><th>Participant</th><th>Question</th><th>Answer</th><th>Result</th><th>XP</th><th>Time</th></tr></thead><tbody>{attempts.map((a,i)=><tr key={`${a.public_id}-${a.question_code}-${i}`}><td>{a.public_id}</td><td>{a.question_code}</td><td>{a.selected_option}</td><td>{a.is_correct?'Correct':'Incorrect'}</td><td>{a.points}</td><td>{new Date(a.answered_at).toLocaleString()}</td></tr>)}</tbody></table></div><h3>Administrator audit log</h3><div className="table-scroll"><table className="table"><thead><tr><th>Action</th><th>Details</th><th>Time</th></tr></thead><tbody>{activity.map(a=><tr key={a.id}><td>{a.action}</td><td>{JSON.stringify(a.detail)}</td><td>{new Date(a.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></div>}{tab==='participants'&&<div className="panel"><h2>Participants</h2><div className="table-scroll"><table className="table"><thead><tr><th>TECHNOVA ID</th><th>Display</th><th>XP</th><th>Answered</th><th>Correct</th><th>Status</th><th>Action</th></tr></thead><tbody>{participants.map(p=><tr key={p.public_id}><td>{p.public_id}</td><td>{p.anonymous?'Anonymous':p.display_name??'—'}</td><td>{p.total_points}</td><td>{p.answered}</td><td>{p.correct}</td><td>{p.is_blocked?'Blocked':'Active'}</td><td><button className="btn compact secondary" onClick={()=>void toggleBlock(p)}>{p.is_blocked?'Unblock':'Block'}</button></td></tr>)}</tbody></table></div></div>}
  </section></main>;
}
