'use client';

import { useEffect, useRef, useState } from 'react';
import { paperSamples, type Bill, type Draft, type Ledger } from '../lib/model';
import { checklist, money, shiftMonth, summarize, taipeiToday } from '../lib/summary';
import { Icon } from './icons';
import { MonthlyTrend } from './report-charts';
import { FormSafety, TrackedForm, useFormSafety } from './form-safety';
import { BillEditor, BillList, DraftRow, MonthBills, ScheduleSettings } from './bill-manager';

const sections = [
  { title: '總覽', icon: 'dashboard' },
  { title: '帳單', icon: 'inbox' },
  { title: '收入與投資', icon: 'report' },
] as const;
const monthLabel = (value: string) => `${Number(value.slice(5))} 月`;
const optionalAmount = (value: FormDataEntryValue | null) => value === null || String(value).trim() === '' ? null : Number(value);

export default function Home() { return <FormSafety><LedgerApp/></FormSafety>; }

function LedgerApp() {
  const { guard } = useFormSafety();
  const [destination,setDestination]=useState<{id:string}>();
  const importedDraft=useRef<Draft>(undefined);
  const [data,setData]=useState<Ledger>();
  const [tab,setTab]=useState<(typeof sections)[number]['title']>('總覽');
  const [month,setMonth]=useState('');
  const [today,setToday]=useState('');
  const [review,setReview]=useState<{record:Draft;editing:boolean}>();
  const [photo,setPhoto]=useState<File>();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [account,setAccount]=useState<{name:string;email:string}|null>(null);
  const [storage,setStorage]=useState<{mode:string;canReset:boolean}>({mode:'file',canReset:true});
  useEffect(()=>{
    const today=taipeiToday();setToday(today);setMonth(today.slice(0,7));
    fetch('/api/auth/session').then(response=>response.json()).then(result=>{setAccount(result.user??null);setStorage({mode:result.storage,canReset:!!result.canReset});}).catch(()=>{});
    fetch('/api/demo').then(async response=>{if(response.status===401){window.location.href='/login';return;}const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error);setData(result);})
      .catch(cause=>{setError(true);setMessage((cause instanceof Error&&cause.message)||'無法載入帳本，請重新整理。');});
  },[]);
  async function send(action:string,fields:Record<string,unknown>,done:string):Promise<Ledger|undefined> {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});
      if(response.status===401){window.location.href='/login';return undefined;}
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setData(result);setError(false);setMessage(done);return result;
    } catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'操作失敗');return undefined;}
    finally{setBusy(false);}
  }
  useEffect(()=>{
    if (!destination) return;
    const frame=requestAnimationFrame(()=>{
      const target=document.getElementById(destination.id);
      if (target instanceof HTMLDetailsElement) target.open=true;
      target?.scrollIntoView({block:target instanceof HTMLInputElement?'center':'start'});
      const focus=target instanceof HTMLInputElement ? target : target?.querySelector<HTMLElement>('input:not([type="hidden"])') ?? target?.querySelector<HTMLElement>('button, summary, h2, h3');
      focus?.focus({preventScroll:true});
    });
    return ()=>cancelAnimationFrame(frame);
  },[destination]);
  function navigate(next:typeof tab, id?:string){
    if(busy)return;
    guard(()=>{setTab(next);setReview(undefined);setMessage('');setPhoto(undefined);
      if(id==='fixed-settings')setSettingsOpen(true);
      if(id)setDestination({id});else window.scrollTo(0,0);
    });
  }
  function changeMonth(next:string){if(next&&next!==month&&!busy)guard(()=>{setMonth(next);setReview(undefined);});}
  function openDraft(record:Draft){guard(()=>{setTab('帳單');setReview({record,editing:false});});}
  function editBill(record:Bill){if(!busy)guard(()=>{setTab('帳單');setReview({record,editing:true});});}
  function addManualBill(){if(!busy)guard(async()=>{
    const result=await send('manual_draft',{month},'已建立草稿，請填入帳單資料。');
    if(result)openDraft(result.drafts[result.drafts.length-1]);
  });}
  const report=data&&month?summarize(data,month):undefined;
  const activeBills=data?.bills.filter(bill=>!bill.voidedOn)??[];
  const unpaid=activeBills.filter(bill=>!bill.paidOn&&!bill.coveredByCard).sort((a,b)=>a.due.localeCompare(b.due));
  const monthlyBills=activeBills.filter(bill=>bill.month===month);
  const pending=data?.drafts.filter(draft=>draft.source!=='bank'&&draft.month===month)??[];
  const otherDrafts=data?.drafts.filter(draft=>draft.source==='bank'||draft.month!==month)??[];
  const expected=data?checklist(data,month):[];
  const missing=expected.filter(item=>!item.bill);
  const notStarted=expected.filter(item=>!item.bill&&!item.draft);
  const canComplete=missing.length===0&&pending.length===0;
  const investment=data?.investments?.[month];
  const scheduleCount=data?.schedules?.length??0;
  const monthlyTrend=data&&<MonthlyTrend month={month} totals={data.totals} onMonth={changeMonth}/>;
  const billGaps=[notStarted.length?`${notStarted.length} 份未收到`:'',pending.length?`${pending.length} 份待核對`:''].filter(Boolean).join('、');
  const steps=report?[
    {title:'設定固定帳單',done:scheduleCount>0,detail:scheduleCount?`已設定 ${scheduleCount} 項`:'例如卡費、電費，系統會提醒缺漏',action:'設定固定帳單',go:()=>navigate('帳單','fixed-settings')},
    {title:'本月帳單收齊',done:report.billsComplete,detail:report.billsComplete?'已確認收齊':billGaps?`還有 ${billGaps}`:`已加入 ${monthlyBills.length} 份，待確認沒有缺漏`,action:'處理帳單',go:()=>navigate('帳單','month-checklist')},
    {title:'填寫投入與股息',done:report.investment!==null&&report.dividends!==null,detail:report.investment!==null&&report.dividends!==null?'已填寫':`${[report.investment===null?'投入':'',report.dividends===null?'股息':''].filter(Boolean).join('、')}待填寫`,action:'填寫投入與股息',go:()=>navigate('收入與投資','investment-amount')},
    {title:'確認薪資入帳',done:report.salaryReceived,detail:report.salaryReceived?'已入帳':'目前為預估',action:'填寫入帳日',go:()=>navigate('收入與投資','salary-received')},
  ]:[];
  const doneSteps=steps.filter(step=>step.done).length;
  const progress=report&&<section className="panel progress" aria-label="本月進度">
    <div className="section-title"><h2>{monthLabel(month)}進度</h2><span className={'badge '+(doneSteps===steps.length?'':'pending')}>完成 {doneSteps}／{steps.length}</span></div>
    <div className="progress-bar" role="presentation"><div style={{width:`${doneSteps/steps.length*100}%`}}/></div>
    {doneSteps<steps.length&&<ol className="steps">{steps.map(step=><li key={step.title} className={step.done?'done':''}>
      <span className="step-mark" aria-hidden="true">{step.done?<Icon name="check"/>:null}</span>
      <div><b>{step.title}<span className="visually-hidden">{step.done?'（已完成）':'（未完成）'}</span></b><small>{step.detail}</small></div>
      {!step.done&&<button disabled={busy} onClick={step.go}>{step.action}</button>}
    </li>)}</ol>}
    {doneSteps===steps.length&&<p className="all-done">本月資料已完整。</p>}
  </section>;
  const confirmation=report&&<div className="month-confirm" role="region" aria-label="本月資料完整度">
    <div><span className={'badge '+(report.billsComplete?'':'pending')}>{report.billsComplete?'帳單已收齊':'帳單待確認'}</span>
      <small>{report.billsComplete?'新增或修改帳單會重新開啟確認。':!canComplete?`還有 ${billGaps}。`:'確認沒有缺漏後按此（與繳款無關）。'}</small></div>
    <button disabled={busy||(!report.billsComplete&&!canComplete)} onClick={()=>send('complete_month',{month,complete:!report.billsComplete},report.billsComplete?'已重新開啟本月帳單確認。':'已確認本月帳單收齊。')}>{report.billsComplete?'重新開啟確認':'本月帳單都已加入'}</button>
  </div>;

  return <div className="shell"><aside>
    <div className="brand"><span><Icon name="brand"/></span><div>家用帳本<small>HOUSEHOLD LEDGER</small></div></div>
    <nav aria-label="主要導覽">{sections.map(item=><button key={item.title} className={tab===item.title?'active':''} aria-current={tab===item.title?'page':undefined} disabled={busy} onClick={()=>navigate(item.title)}><Icon name={item.icon}/>{item.title}</button>)}</nav>
    <div className="side-note">{account&&<div className="account"><b>{account.name}</b><span>{account.email}</span>
      <form method="post" action="/api/auth/logout" onSubmit={event=>{const form=event.currentTarget;event.preventDefault();guard(()=>form.submit());}}><button className="text-button" disabled={busy}>登出</button></form></div>}
      {storage.mode==='postgres'?<><b>雲端帳本</b><p>資料儲存在雲端資料庫，登入的家人共用同一本帳本。</p></>:<><b>本機示範</b><p>假資料儲存在此電腦，尚未連接雲端。</p></>}
      {storage.canReset&&<button className="text-button" disabled={busy||!data} onClick={()=>guard(async()=>{if(window.confirm('要清除示範操作並重設嗎？'))if(await send('reset',{},'已恢復示範資料。')){setReview(undefined);setPhoto(undefined);setTab('總覽');}})}>重設示範資料</button>}</div>
  </aside><main>
    <header><h1>{tab==='總覽'?'收支總覽':tab}</h1><span className="badge demo-badge">{storage.mode==="postgres"?"雲端同步":"本機 Demo"}</span></header>
    {message&&<div className={'notice floating-notice '+(error?'error':'')}><span role={error?'alert':'status'}>{message}</span><button aria-label="關閉提示" onClick={()=>setMessage('')}>×</button></div>}
    {!data&&!message&&<p role="status">載入中…</p>}
    {data&&report&&<>
      <div className="month-nav" role="group" aria-label="切換月份">
        <button type="button" aria-label="上個月" disabled={busy} onClick={()=>changeMonth(shiftMonth(month,-1))}>‹</button>
        <label className="month-picker"><Icon name="calendar"/><span aria-hidden="true">{month.slice(0,4)} 年 {monthLabel(month)}</span>
          <input aria-label="查看月份" type="month" value={month} min="2000-01" max="2099-12" disabled={busy} onClick={event=>{try{event.currentTarget.showPicker?.();}catch{}}} onChange={event=>changeMonth(event.target.value)}/></label>
        <button type="button" aria-label="下個月" disabled={busy} onClick={()=>changeMonth(shiftMonth(month,1))}>›</button>
        {today&&month!==today.slice(0,7)&&<button type="button" className="text-button" disabled={busy} onClick={()=>changeMonth(today.slice(0,7))}>回到本月</button>}
      </div>
      {tab==='總覽'&&progress}
      {tab==='總覽'&&<section className="stats" aria-label="每月收支">{[
        {label:report.salaryReceived&&report.dividends!==null?'實際收入':'收入',value:money(report.income),detail:[report.salaryReceived?'薪資已入帳':'薪資為預估',report.dividends===null?'股息待填寫':''].filter(Boolean).join('，'),icon:'income' as const},
        {label:'帳單支出',value:report.hasBills||report.billsComplete?money(report.expenses):'資料未齊',detail:report.billsComplete?'帳單已收齊':'帳單尚未收齊',icon:'expense' as const},
        {label:'股票投入',value:report.investment===null?'待填寫':money(report.investment),detail:'本月新撥入投資',icon:'report' as const},
        {label:'本月預計剩餘',value:report.balance===null?'資料未齊':money(report.balance),detail:report.balance===null?'帳單收齊、投入與股息填寫後顯示':'收入－帳單－投入（非銀行餘額）',icon:'balance' as const},
      ].map(item=><article className={'metric '+item.icon} key={item.label}><div className="metric-title"><p>{item.label}</p><span className="icon-tile"><Icon name={item.icon}/></span></div><strong>{item.value}</strong><small>{item.detail}</small></article>)}</section>}
      {tab==='總覽'&&<>
        <section className="panel" aria-label="未繳帳單"><div className="section-title"><h2>未繳帳單 <span className="count">{unpaid.length}</span></h2>{unpaid.length>0&&<small>合計 {money(unpaid.reduce((sum,bill)=>sum+bill.amount,0))} · 最近期限 {unpaid[0].due}</small>}</div>
          {!unpaid.length&&<p className="empty-state">目前沒有待繳帳單。</p>}<BillList bills={unpaid} busy={busy} send={send} edit={editBill} showMonth/></section>
        {monthlyTrend}
      </>}
      {tab==='帳單'&&<>
        {settingsOpen&&<ScheduleSettings data={data} month={month} busy={busy} send={send} close={()=>setSettingsOpen(false)} next={()=>{setSettingsOpen(false);setDestination({id:'month-checklist'});}}/>}
        {review&&<BillEditor key={review.record.id+'-'+review.editing} record={review.record} editing={review.editing} data={data} busy={busy} send={send} close={()=>setReview(undefined)}/>}
        <section id="month-checklist" className="panel month-bills" aria-label="本月帳單">
          <div className="section-title wrap"><div><h2 tabIndex={-1}>{monthLabel(month)}帳單</h2>
            <small>{[scheduleCount?`固定帳單已收到 ${expected.length-missing.length}／${expected.length} 份`:'',`已計入 ${money(report.expenses)}`].filter(Boolean).join(' · ')}</small></div>
            <div className="toolbar">
              <button className="primary" disabled={busy} onClick={addManualBill}><Icon name="plus"/>新增帳單</button>
              <button disabled={busy} aria-expanded={importOpen} onClick={()=>setImportOpen(!importOpen)}><Icon name="camera"/>匯入帳單</button>
              <button disabled={busy} aria-expanded={settingsOpen} onClick={()=>settingsOpen?setSettingsOpen(false):navigate('帳單','fixed-settings')}>固定帳單設定（{scheduleCount}）</button>
            </div></div>
          {importOpen&&<div className="import-grid">
            <div className="import-box"><h3>紙本照片（示範）</h3><small>目前帶入範例欄位，照片會保存供回看。</small>
              <TrackedForm onReset={()=>setPhoto(undefined)} onSave={async form=>{
                const title=form.get('title');let attachmentId:string|undefined;
                if(photo){setBusy(true);setMessage('');try{const body=new FormData();body.set('file',photo);const response=await fetch('/api/attachments',{method:'POST',body});const result=await response.json();if(!response.ok)throw new Error(result.error);attachmentId=result.id;}catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'照片上傳失敗');setBusy(false);return false;}}
                const result=await send('paper',{title,month,attachmentId},'已帶入範例，請對照帳單核對。');
                if(result)importedDraft.current=result.drafts[result.drafts.length-1];return !!result;
              }} onSaved={()=>{if(importedDraft.current)openDraft(importedDraft.current);setPhoto(undefined);setImportOpen(false);}}>
                <label>帳單樣本<select name="title">{paperSamples.map(item=><option key={item.title}>{item.title}</option>)}</select></label>
                <label>照片（選填，8 MB 以下）<input key={photo?'selected':'empty'} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event=>setPhoto(event.target.files?.[0])}/></label>
                {photo&&<small>已選擇：{photo.name}</small>}
                <button className="primary" disabled={busy}>開始核對紙本</button>
              </TrackedForm></div>
            <div className="import-box"><h3>Drive 匯入（模擬）</h3><small>取得一份信用卡範例帳單。</small>
              <button className="primary" disabled={busy} onClick={async()=>{if(await send('sync',{},data.synced?'沒有新的示範帳單。':'已取得信用卡範例，請在清單中核對。'))setImportOpen(false);}}>模擬立即同步</button></div>
          </div>}
          <MonthBills data={data} month={month} busy={busy} send={send} openDraft={openDraft} editBill={editBill}/>
          {confirmation}
        </section>
        {otherDrafts.length>0&&<section id="pending-bills" className="panel" aria-label="其他待處理"><h2 tabIndex={-1}>其他月份待處理 <span className="count">{otherDrafts.length}</span></h2>
          {otherDrafts.map(draft=><DraftRow key={draft.id} draft={draft} busy={busy} showMonth open={()=>openDraft(draft)}/>)}</section>}
        <details className="panel"><summary>已移除清單（{data.bills.filter(b=>b.voidedOn).length}）</summary><BillList bills={data.bills.filter(b=>b.voidedOn)} busy={busy} send={send} edit={editBill} showMonth/></details>
      </>}
      {tab==='收入與投資'&&<section id="investment-form" className="panel income-form" aria-label="本月收入與投資">
        <div className="section-title"><h2>{monthLabel(month)}收入與投資</h2><span className={'badge '+(report.salaryReceived?'done':'pending')}>{report.salaryReceived?'薪資已入帳':'薪資為預估'}</span></div>
        <p>還不確定的金額可留白，確定沒有請填 0。</p>
        <TrackedForm key={month+'-income'} className="income-grid" onSave={async form=>!!await send('month_income',{month,salary:Number(form.get('salary')),receivedOn:form.get('receivedOn'),
          amount:optionalAmount(form.get('amount')),dividends:optionalAmount(form.get('dividends'))},'已儲存本月收入與投資。')}>
          <fieldset><legend>薪資</legend>
            <label>薪資金額<input name="salary" type="number" min="0" max="999999999" step="1" required defaultValue={report.salary}/></label>
            <label>實際入帳日（未入帳留白）<input id="salary-received" name="receivedOn" type="date" max={today} defaultValue={data.salaryReceipts?.[month]??''}/></label>
          </fieldset>
          <fieldset><legend>投資</legend>
            <label>本月新投入<input id="investment-amount" name="amount" type="number" min="0" max="999999999" step="1" placeholder="待填寫" defaultValue={investment?.amount??''}/></label>
            <label>本月股息<input name="dividends" type="number" min="0" max="999999999" step="1" placeholder="待填寫" defaultValue={investment?.dividends??''}/></label>
          </fieldset>
          <details className="help"><summary>怎麼填？</summary>
            <p>薪資：預設月薪 {money(data.salary)}，可逐月修改；填入實際入帳日才算已入帳。</p>
            <p>投入：本月從生活資金新撥入投資的金額；賣出後再買進不重複計入。例如轉 10,000 元到證券帳戶就填 10,000。</p>
            <p>股息：本月實際收到的股息總額。</p>
          </details>
          <button disabled={busy} className="primary">儲存收入與投資</button>
        </TrackedForm>
      </section>}
    </>}
  </main></div>;
}
