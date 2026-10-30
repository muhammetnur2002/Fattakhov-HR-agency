(async()=>{
if(process.env.RUN_TEST_CLEANUP !== "approved-2026-10-30-five-accounts") return;
const assert=require('node:assert/strict');const {Client}=require('pg');const u=new URL(process.env.DATABASE_URL);
assert.equal(u.hostname,'ep-floral-lake-auxhngin-pooler.c-10.us-east-1.aws.neon.tech');assert.equal(u.pathname,'/neondb');
assert.ok([process.env.APP_URL,process.env.AUTH_URL].includes('https://fattakhov-hr-agency-a7o3.vercel.app'));
const p=new Client({connectionString:process.env.DATABASE_URL});await p.connect();
const keepUsers=['cmu4ru61w000004kubwxjag3o','cmugye93m000004jssyzwidrl','cmufk9j5t000104lgqa3jbhtv'];
const dropUsers=['cmujpv25g000004kxzvn9e3ia','cmumm2sxv000204i8gu6eerwh'];const keepClient='cmufk7kca000004lgid34k2y7';const dropClients=['cmujpttik000004l38j8ardy8','cmumm2sxg000104i83zssljxf'];const hashes=JSON.parse(process.env.CLEANUP_HASHES);
const quote=s=>'"'+s.replaceAll('"','""')+'"';let removed=0;
try{await p.query('BEGIN');await p.query('SET LOCAL statement_timeout = 45000');await p.query('LOCK TABLE "User", "Client" IN SHARE ROW EXCLUSIVE MODE');
const users=(await p.query('SELECT id,role FROM "User"')).rows;assert.deepEqual(users.map(x=>x.id).sort(),[...keepUsers,...dropUsers].sort());assert.equal(users.find(x=>x.id===keepUsers[0]).role,'OWNER');assert.equal(users.find(x=>x.id===keepUsers[1]).role,'RECRUITER');
assert.equal((await p.query('SELECT count(*)::int n FROM "Vacancy" WHERE "clientId"=ANY($1)',[dropClients])).rows[0].n,0);
const edges=(await p.query(`SELECT child.relname AS child, ca.attname AS col, parent.relname AS parent, pa.attname AS pcol FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace ns ON ns.oid=child.relnamespace JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=fk.conkey[1] JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=fk.confkey[1] WHERE fk.contype='f' AND ns.nspname='public' AND array_length(fk.conkey,1)=1`)).rows;
const allowed=new Set(['Client','User','Agreement','Invoice','Attachment','Lead','DisclosureConsent','DirectMessage','ActivityLog','Comment','CommentRead','Invitation','PasswordReset','RecoveryCode','PushSubscription','StudentMessageDraft']);
async function removeRows(table,where,params,depth=0){assert.ok(depth<12);const rows=(await p.query(`SELECT ctid::text AS loc,to_jsonb(t) AS data FROM ${quote(table)} t WHERE ${where}`,params)).rows;if(!rows.length)return;assert.ok(allowed.has(table),'Unexpected dependent table');for(const r of rows){if(table==='User')assert.ok(dropUsers.includes(r.data.id));if(table==='Client')assert.ok(dropClients.includes(r.data.id));}
const loc=rows.map(r=>r.loc);for(const edge of edges.filter(e=>e.parent===table)){await removeRows(edge.child,`${quote(edge.col)} IN (SELECT ${quote(edge.pcol)} FROM ${quote(table)} WHERE ctid=ANY($1::tid[]))`,[loc],depth+1);}const res=await p.query(`DELETE FROM ${quote(table)} WHERE ctid=ANY($1::tid[])`,[loc]);removed+=res.rowCount;}
await p.query('DELETE FROM "Notification" WHERE "userId"=ANY($1)',[dropUsers]);
await removeRows('User','id=ANY($1)',[dropUsers]);await removeRows('Client','id=ANY($1)',[dropClients]);
for(const id of keepUsers){assert.ok(hashes[id].startsWith('$argon2'));await p.query('UPDATE "User" SET "passwordHash"=$1,"passwordChangedAt"=NOW(),"isActive"=true WHERE id=$2',[hashes[id],id]);await p.query('DELETE FROM "PasswordReset" WHERE "userId"=$1',[id]);}
assert.equal((await p.query('SELECT count(*)::int n FROM "User"')).rows[0].n,3);assert.equal((await p.query('SELECT count(*)::int n FROM "Client" WHERE id=$1',[keepClient])).rows[0].n,1);await p.query('COMMIT');console.log('TEST_CLEANUP_CRM_COMMITTED users=3 clients=1 relatedRows='+removed);
}catch(e){await p.query('ROLLBACK');throw e;}finally{await p.end();}
})().catch(e=>{console.error('TEST_CLEANUP_ABORTED '+(e.code||e.name));process.exitCode=1;});
