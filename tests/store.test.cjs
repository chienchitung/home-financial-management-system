const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=process.cwd();const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-unit-'));
process.env.DEMO_DATA_DIR=path.join(temporary,'data');fs.mkdirSync(process.env.DEMO_DATA_DIR);
execFileSync(path.join(root,'node_modules/.bin/tsc'),['lib/store.ts','lib/model.ts','lib/summary.ts','--outDir',path.join(temporary,'compiled'),'--module','commonjs','--target','ES2022','--skipLibCheck','--ignoreConfig','--types','node']);
const {mutate,read,present}=require(path.join(temporary,'compiled/store.js'));
const {summarize,checklist,isExpected,shiftMonth}=require(path.join(temporary,'compiled/summary.js'));
const fixture=()=>({month:'2026-11',salary:68000,synced:false,entries:[],drafts:[],bills:[]});
function write(data=fixture()){fs.writeFileSync(path.join(process.env.DEMO_DATA_DIR,'ledger.json'),JSON.stringify(data));}
function schedule(fields={}){mutate({action:'schedule',title:'電費',source:'paper',startMonth:'2026-11',endMonth:'',interval:2,dueDay:31,...fields});return read().schedules.at(-1);}
function confirmDraft(draft,fields={}){mutate({action:'confirm',id:draft.id,title:draft.title,month:draft.month,due:draft.due,amount:1200,source:draft.source,scheduleId:draft.scheduleId,...fields});}
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
test('unknown and confirmed zero stay distinct across persistence',()=>{write();let report=summarize(read(),'2026-11');assert.equal(report.investment,null);assert.equal(report.dividends,null);assert.equal(report.balance,null);assert.equal(report.hasBills,false);
mutate({action:'investment',month:'2026-11',amount:0,dividends:null});assert.equal(summarize(read(),'2026-11').investment,0);assert.equal(summarize(read(),'2026-11').balance,null);
mutate({action:'investment',month:'2026-11',amount:0,dividends:0});mutate({action:'complete_month',month:'2026-11',complete:true});assert.equal(summarize(read(),'2026-11').balance,68000);
mutate({action:'investment',month:'2026-11',amount:null,dividends:0});assert.equal(summarize(read(),'2026-11').balance,null);});
test('recurrence anchors, annual boundaries, and short months',()=>{write();const recurring=schedule();assert.equal(isExpected(recurring,'2026-10'),false);assert.equal(isExpected(recurring,'2026-11'),true);assert.equal(isExpected(recurring,'2026-12'),false);assert.equal(isExpected(recurring,'2027-01'),true);
const yearly=schedule({title:'保費',interval:12,startMonth:'2026-02',endMonth:'2028-02'});assert.equal(isExpected(yearly,'2027-02'),true);assert.equal(isExpected(yearly,'2027-03'),false);assert.equal(isExpected(yearly,'2029-02'),false);
mutate({action:'schedule_draft',id:yearly.id,month:'2027-02'});assert.equal(read().drafts[0].due,'2027-02-28');assert.equal(shiftMonth('2026-01',-1),'2025-12');});
test('missing and draft bills block completion; duplicate confirmation rejected',()=>{write();const recurring=schedule({interval:1});assert.throws(()=>mutate({action:'complete_month',month:'2026-11',complete:true}));
mutate({action:'schedule_draft',id:recurring.id,month:'2026-11'});assert.throws(()=>mutate({action:'schedule_draft',id:recurring.id,month:'2026-11'}));assert.throws(()=>mutate({action:'complete_month',month:'2026-11',complete:true}));const draft=read().drafts[0];confirmDraft(draft);assert.equal(checklist(read(),'2026-11')[0].bill.amount,1200);assert.throws(()=>confirmDraft(draft));mutate({action:'complete_month',month:'2026-11',complete:true});assert.equal(summarize(read(),'2026-11').billsComplete,true);});
test('edit, pay, undo, void, restore preserve source and avoid double expense',()=>{write();mutate({action:'paper',title:'中華電信',month:'2026-11'});const draft=read().drafts[0];confirmDraft(draft);const common={id:draft.id,title:'電信修正',source:'paper',month:'2026-11',due:'2026-11-20',amount:1300,autoDebit:true};
mutate({action:'complete_month',month:'2026-11',complete:true});mutate({action:'edit_bill',...common});assert.equal(summarize(read(),'2026-11').billsComplete,false);assert.equal(read().bills[0].original.amount,699);
mutate({action:'pay',id:draft.id,date:'2026-11-01'});assert.equal(summarize(read(),'2026-11').expenses,1300);mutate({action:'unpay',id:draft.id});assert.equal(read().bills[0].paidOn,undefined);assert.equal(summarize(read(),'2026-11').expenses,1300);
mutate({action:'void_bill',id:draft.id});assert.equal(summarize(read(),'2026-11').expenses,0);mutate({action:'restore_bill',id:draft.id});assert.equal(summarize(read(),'2026-11').expenses,1300);
mutate({action:'edit_bill',...common,month:'2026-12'});assert.equal(summarize(read(),'2026-11').expenses,0);assert.equal(summarize(read(),'2026-12').expenses,1300);assert.equal(read().bills[0].original.amount,699);});
test('card-covered bills do not duplicate card totals',()=>{write();mutate({action:'paper',title:'中華電信',month:'2026-11'});confirmDraft(read().drafts[0],{coveredByCard:true,amount:699});const id=read().bills[0].id;assert.equal(summarize(read(),'2026-11').expenses,0);assert.throws(()=>mutate({action:'pay',id,date:'2026-11-01'}));
const data=read();data.drafts.push({id:'card',title:'卡費',month:'2026-11',due:'2026-11-25',amount:2000,source:'card'});write(data);confirmDraft(read().drafts[0],{amount:2000});assert.equal(summarize(read(),'2026-11').expenses,2000);});
test('investment replaces monthly amounts; salary is estimated until dated',()=>{write();mutate({action:'investment',month:'2026-11',amount:10000,dividends:1000});mutate({action:'investment',month:'2026-11',amount:12000,dividends:2000});assert.equal(summarize(read(),'2026-11').income,70000);assert.equal(summarize(read(),'2026-11').investment,12000);assert.equal(summarize(read(),'2026-11').salaryReceived,false);
mutate({action:'salary',month:'2026-11',amount:68000,receivedOn:'2026-11-01'});assert.equal(summarize(read(),'2026-11').salaryReceived,true);mutate({action:'salary',month:'2026-11',amount:68000,receivedOn:''});assert.equal(summarize(read(),'2026-11').salaryReceived,false);
for(const amount of [-1,1.1,'0',1000000000])assert.throws(()=>mutate({action:'investment',month:'2026-11',amount,dividends:0}));});
test('legacy data and explicit zero survive upgrade with backup',()=>{const old=fixture();old.entries=[{id:'salary',date:'2026-11-30',amount:68000,kind:'income',label:'預設'},{id:'old-expense',date:'2026-11-01',amount:999999,kind:'expense',label:'legacy'}];old.investments={'2026-11':{amount:0,dividends:0}};write(old);assert.equal(present(read()).totals['2026-11'].expenses,0);assert.equal(summarize(read(),'2026-11').investment,0);assert.equal(summarize(read(),'2026-11').salaryReceived,false);mutate({action:'complete_month',month:'2026-11',complete:true});assert.ok(fs.existsSync(path.join(process.env.DEMO_DATA_DIR,'ledger.json.before-v020')));assert.equal(read().entries.length,2);});
