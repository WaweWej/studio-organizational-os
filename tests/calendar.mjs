import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {calendarEntries, filterDeadlines, deadlineCommand, dateKey, localDate, shiftMonth} from '../lib/calendar-model.ts';
import {initialWorkspace} from '../lib/model.ts';

const seed = initialWorkspace();
const all = calendarEntries(seed);
assert.equal(all.length, seed.projects.length + seed.tasks.length);
assert.equal(new Set(all.map(e => e.key)).size, all.length);
assert(!all.some(e => seed.meetings.some(m => m.id === e.id)), 'Employee meetings do not become deadline events.');
const active = filterDeadlines(all,{kind:'all',space:'all',project:'all',completed:false});
assert(!active.some(e => e.complete));
assert(active.some(e => e.id === 'internal' && e.kind === 'project'));
assert(filterDeadlines(all,{kind:'project',space:'nord',project:'all',completed:true}).every(e => e.spaceId === 'nord' && e.kind === 'project'));
assert.equal(dateKey(localDate('2028-02-29')), '2028-02-29');
assert.equal(dateKey(shiftMonth(localDate('2026-12-31'),1)), '2027-01-01');
assert.equal(dateKey(shiftMonth(localDate('2026-03-31'),-1)), '2026-02-01');

const base='http://localhost:5173';
async function call(command, other=false) {
  const r=await fetch(base+'/api/workspace',{method:command?'POST':'GET',headers:{...(other?{}:{Cookie:'__sites_local_auth=1'}),...(command?{'Content-Type':'application/json'}:{})},body:command?JSON.stringify(command):undefined});
  return {status:r.status,data:await r.json()};
}
let original, taskId;
try {
  let result=await call();assert.equal(result.status,200);original=result.data.projects.find(p=>p.id==='internal');
  const entry=calendarEntries(result.data).find(e=>e.key==='project:internal');
  result=await call(deadlineCommand(entry,'2026-11-01'));assert.equal(result.status,200);
  const updated=result.data.projects.find(p=>p.id==='internal');assert.equal(updated.due,'2026-11-01');assert.equal(updated.description,original.description);
  assert.equal((await call(deadlineCommand(entry,'2026-11-02'))).status,409,'Stale project moves are rejected.');
  assert.equal((await call({type:'project-deadline',id:'missing-project',previous:'',due:'2026-11-03'})).status,404);
  result=await call({type:'create',title:'[Verification] Calendar deadline',projectId:'internal',description:'Keep this brief.',due:''});assert.equal(result.status,200);const task=result.data.tasks.find(t=>t.title==='[Verification] Calendar deadline');taskId=task.id;
  let taskEntry=calendarEntries(result.data).find(e=>e.id===taskId);assert.equal(taskEntry.due,'');
  result=await call(deadlineCommand(taskEntry,'2026-10-25'));assert.equal(result.status,200);taskEntry=calendarEntries(result.data).find(e=>e.id===taskId);assert.equal(taskEntry.due,'2026-10-25');
  assert.equal(result.data.tasks.find(t=>t.id===taskId).description,'Keep this brief.');
  assert.equal((await call(deadlineCommand(taskEntry,'2026-10-26'),true)).status,404);
  result=await call(deadlineCommand(taskEntry,''));assert.equal(result.status,200);assert.equal(calendarEntries(result.data).find(e=>e.id===taskId).due,'');
  const reloaded=await call();assert.equal(reloaded.data.tasks.find(t=>t.id===taskId).due,'');
  console.log('PASS: canonical calendar entries, client/type/completion filters, internal project deadlines, unscheduled work, date-only navigation, rescheduling persistence and concurrency, tenant isolation.');
} finally {
  if(original){const state=(await call()).data;const current=state.projects.find(p=>p.id===original.id);assert.equal((await call({type:'project-deadline',id:current.id,previous:current.due,due:original.due})).status,200);}
  if(taskId){assert.match(taskId,/^[a-f0-9-]+$/);await mkdir('work',{recursive:true});await writeFile('work/calendar-cleanup.sql',[...['notes','activities','reviews','notices'].map(t=>`DELETE FROM ${t} WHERE org='local_seedy' AND taskId='${taskId}';`),`DELETE FROM tasks WHERE org='local_seedy' AND id='${taskId}';`].join('\n'));}
}
