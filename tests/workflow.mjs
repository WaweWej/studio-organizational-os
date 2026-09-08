import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.STUDIO_TEST_URL||'http://localhost:5173';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('This suite creates sample records and must target local development.');
const cookie='__sites_local_auth=1';
async function request(command,other=false){const r=await fetch(base+'/api/workspace',{method:command?'POST':'GET',headers:{...(other?{}:{Cookie:cookie}),...(command?{'Content-Type':'application/json'}:{})},body:command?JSON.stringify(command):undefined});return {status:r.status,data:await r.json()}}
let id;
try {
 const start=await request();assert.equal(start.status,200);const title='[Verification] Review workflow '+Date.now();
 const created=await request({type:'create',title,description:'Local automated test record',projectId:'autumn'});assert.equal(created.status,200);id=created.data.tasks.find(t=>t.title===title).id;
 let state=created.data;const task=()=>state.tasks.find(t=>t.id===id);
 async function action(type,extra={},expected=200){const r=await request({type,id,revision:task().revision,...extra});assert.equal(r.status,expected,JSON.stringify(r.data));if(r.status===200)state=r.data;return r}
 await action('submit',{},400);
 await action('note',{body:'The approved direction is calm and material-led.'});assert(state.notes.some(n=>n.taskId===id));
 await action('deliverable',{body:'Version one: proposed campaign copy.'});
 await action('submit');assert.equal(task().stage,'Review');assert.equal(task().version,1);assert.equal(state.reviews.find(r=>r.taskId===id).snapshot,'Version one: proposed campaign copy.');
 await action('review',{decision:'Changes requested',feedback:'Make the call to action clearer.'});assert.equal(task().stage,'Doing');
 await action('deliverable',{body:'Version two: explore the collection.'});await action('submit');assert.equal(task().version,2);
 await action('review',{decision:'Approved',feedback:'Ready.'});
 await action('review',{decision:'Approved',feedback:'Duplicate'},409);
 await action('complete');assert.equal(task().stage,'Done');assert.equal(task().delivery,'Internal completion');
 const persisted=await request();assert.equal(persisted.data.tasks.find(t=>t.id===id).stage,'Done');
 const other=await request(undefined,true);assert(!other.data.tasks.some(t=>t.id===id));
 const forbidden=await request({type:'note',id,body:'Must not cross organizations'},true);assert.equal(forbidden.status,404);
 await action('move',{stage:'Doing'});
 const before=state.activities.filter(a=>a.taskId===id).length;const t=task();
 const edit={type:'edit',id,revision:t.revision,description:t.description,due:t.due,blocked:t.blocked,assignee:t.assignee,reviewer:t.reviewer};
 const concurrent=await Promise.all([request({...edit,title:title+' A'}),request({...edit,title:title+' B'})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);state=(await request()).data;assert.equal(state.activities.filter(a=>a.taskId===id).length,before+1);
 const badOrigin=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:'https://untrusted.example'},body:JSON.stringify({type:'note',id,body:'Cross origin'})});assert.equal(badOrigin.status,403);
 console.log('PASS: persistence, versioned changes/review/approval, completion, duplicate review rejection, tenant isolation, optimistic concurrency, audit consistency, origin validation.');
} finally {
 if(id){assert.match(id,/^[a-f0-9-]+$/);await mkdir('work',{recursive:true});const tables=['notes','activities','reviews','notices'];const sql=[...tables.map(t=>`DELETE FROM ${t} WHERE org='local_seedy' AND taskId='${id}';`),`DELETE FROM tasks WHERE org='local_seedy' AND id='${id}';`].join('\n');await writeFile('work/verification-cleanup.sql',sql);console.log('Cleanup prepared for the single generated verification task.');}
}
