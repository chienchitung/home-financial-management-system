// Postgres storage tests. Run with TEST_DATABASE_URL pointing at a disposable database (local Postgres or a Neon branch);
// each run works inside its own schema and drops it afterwards. Skipped when TEST_DATABASE_URL is unset.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.TEST_DATABASE_URL;
const skip=!base&&'TEST_DATABASE_URL 未設定';
const root=process.cwd();
// Compile inside node_modules so the output can resolve the `pg` package.
const compiled=fs.mkdtempSync(path.join(root,'node_modules','.ledger-db-test-'));
const schema='ledger_test_'+process.pid+'_'+Date.now();
const withSchema=url=>{const parsed=new URL(url);parsed.searchParams.set('options','-c search_path='+schema);return parsed.toString();};
let pg,repo,store;
test.before(async()=>{
  if(skip)return;
  execFileSync(path.join(root,'node_modules/.bin/tsc'),['lib/repository.ts','--outDir',compiled,'--module','commonjs','--target','ES2022','--skipLibCheck','--ignoreConfig','--types','node','--esModuleInterop']);
  pg=require('pg');
  const admin=new pg.Client({connectionString:base});await admin.connect();await admin.query(`CREATE SCHEMA ${schema}`);await admin.end();
  Object.assign(process.env,{DATABASE_URL:withSchema(base),LEDGER_ID:'unit',LEDGER_DEFAULT_SALARY:'50000'});delete process.env.LEDGER_ALLOW_RESET;delete process.env.VERCEL;
  repo=require(path.join(compiled,'repository.js'));store=require(path.join(compiled,'store.js'));
});
test.after(async()=>{
  fs.rmSync(compiled,{recursive:true,force:true});
  if(skip)return;
  const shared=globalThis.ledgerPool;if(shared)await shared.end();
  const admin=new pg.Client({connectionString:base});await admin.connect();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
});
async function query(sql,params){const client=new pg.Client({connectionString:withSchema(base)});await client.connect();try{return (await client.query(sql,params)).rows;}finally{await client.end();}}

test('storage mode follows DATABASE_URL and refuses local files on Vercel',{skip},()=>{
  assert.equal(repo.storageMode({DATABASE_URL:'postgres://x'}),'postgres');
  assert.equal(repo.storageMode({}),'file');
  assert.equal(repo.storageMode({VERCEL:'1'}),'unavailable');
  assert.equal(repo.emptyLedger({LEDGER_DEFAULT_SALARY:'-5'}).salary,0);
});

test('a new database creates the schema and an empty household ledger',{skip},async()=>{
  const ledger=await repo.loadLedger();
  assert.deepEqual([ledger.bills.length,ledger.drafts.length,ledger.salary],[0,0,50000]);
  const tables=(await query(`SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY 1`,[schema])).map(row=>row.table_name);
  assert.deepEqual(tables,['attachments','ledger_events','ledgers']);
  process.env.LEDGER_DEFAULT_SALARY='61000';
  try{assert.equal((await repo.loadLedger()).salary,61000);}finally{process.env.LEDGER_DEFAULT_SALARY='50000';}
});

test('changes persist with version, actor and event log; rejected input changes nothing',{skip},async()=>{
  const month=(await repo.loadLedger()).month;
  await repo.runAction({action:'investment',month,amount:10000,dividends:0},'owner@example.com');
  assert.deepEqual((await repo.loadLedger()).investments[month],{amount:10000,dividends:0});
  const [row]=await query('SELECT version, updated_by FROM ledgers WHERE id=$1',['unit']);
  assert.deepEqual(row,{version:2,updated_by:'owner@example.com'});
  await assert.rejects(repo.runAction({action:'investment',month,amount:-1,dividends:0}),store.LedgerError);
  await assert.rejects(repo.runAction({action:'reset'}),/正式帳本不能重設/);
  assert.equal((await query('SELECT version FROM ledgers WHERE id=$1',['unit']))[0].version,2);
  assert.deepEqual(await query('SELECT action, actor, version FROM ledger_events WHERE ledger_id=$1',['unit']),[{action:'investment',actor:'owner@example.com',version:2}]);
});

test('concurrent writes are serialised without losing updates',{skip},async()=>{
  const month=(await repo.loadLedger()).month;const before=(await repo.loadLedger()).drafts.length;
  await Promise.all(Array.from({length:8},()=>repo.runAction({action:'manual_draft',month})));
  assert.equal((await repo.loadLedger()).drafts.length,before+8);
});

test('attachments round-trip and stay scoped to their ledger',{skip},async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const id=await repo.storeAttachment(new File([bytes],'bill.png',{type:'image/png'}));
  const file=await repo.loadAttachment(id);
  assert.equal(file.type,'image/png');assert.ok(Buffer.from(file.bytes).equals(bytes));
  await assert.rejects(repo.storeAttachment(new File(['x'],'a.txt',{type:'text/plain'})),store.LedgerError);
  const month=(await repo.loadLedger()).month;
  const ledger=await repo.runAction({action:'paper',title:'中華電信',month,attachmentId:id});
  assert.equal(ledger.drafts.at(-1).attachmentId,id);
  process.env.LEDGER_ID='other';
  try{
    await assert.rejects(repo.loadAttachment(id),/找不到原檔/);
    await assert.rejects(repo.runAction({action:'paper',title:'中華電信',month,attachmentId:id}),/照片不存在/);
  }finally{process.env.LEDGER_ID='unit';}
});

test('import script copies a local ledger and photos, and will not overwrite without --force',{skip},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-import-'));
  const id='11111111-2222-3333-4444-555555555555';
  fs.mkdirSync(path.join(dir,'attachments'));
  fs.writeFileSync(path.join(dir,'attachments',id),'photo');fs.writeFileSync(path.join(dir,'attachments',id+'.json'),JSON.stringify({name:'a.png',type:'image/png'}));
  fs.writeFileSync(path.join(dir,'ledger.json'),JSON.stringify({month:'2026-11',salary:1,synced:false,entries:[],drafts:[],bills:[{id:'b',title:'電費',month:'2026-11',due:'2026-11-20',amount:900,source:'paper',attachmentId:id}]}));
  const run=(...args)=>execFileSync(process.execPath,['scripts/db-import.mjs',...args],{env:{...process.env,DEMO_DATA_DIR:dir,LEDGER_ID:'imported'},encoding:'utf8',stdio:'pipe'});
  try{
    assert.match(run(),/1 份帳單、0 份草稿、1 張照片/);
    process.env.LEDGER_ID='imported';
    assert.equal((await repo.loadLedger()).totals['2026-11'].expenses,900);
    assert.equal(Buffer.from((await repo.loadAttachment(id)).bytes).toString(),'photo');
    await repo.runAction({action:'manual_draft',month:'2026-11'});
    assert.throws(()=>run(),/已有 .* 次修改，未覆寫/);
    run('--force');assert.equal((await repo.loadLedger()).drafts.length,0);
  }finally{process.env.LEDGER_ID='unit';fs.rmSync(dir,{recursive:true,force:true});}
});
