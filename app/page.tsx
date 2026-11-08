'use client';

import { useEffect, useState } from 'react';
import { paperSamples, type Bill, type Draft, type Ledger } from '../lib/model';
import { checklist, money, summarize, taipeiToday } from '../lib/summary';
import { Icon } from './icons';
import { MonthlyTrend } from './report-charts';
import { BillEditor, BillList, Checklist, ScheduleSettings } from './bill-manager';

const sections = [
  { title: '總覽', icon: 'dashboard', hint: '先處理待辦，再查看這個月的安排。' },
  { title: '帳單', icon: 'inbox', hint: '收齊帳單、核對金額，也能修改與回看原檔。' },
  { title: '薪資與投資', icon: 'report', hint: '每月確認薪資、投入與股息；還不確定的金額可留白。' },
] as const;
const optionalAmount = (value: FormDataEntryValue | null) => value === null || String(value).trim() === '' ? null : Number(value);

export default function Home() {
  const [data,setData]=useState<Ledger>();
  const [tab,setTab]=useState<(typeof sections)[number]['title']>('總覽');
  const [month,setMonth]=useState('');
  const [today,setToday]=useState('');
  const [review,setReview]=useState<{record:Draft;editing:boolean}>();
  const [photo,setPhoto]=useState<File>();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState(false);
  useEffect(()=>{
    const today=taipeiToday();setToday(today);setMonth(today.slice(0,7));
    fetch('/api/demo').then(async response=>{if(!response.ok)throw new Error('讀取失敗');setData(await response.json());})
      .catch(()=>{setError(true);setMessage('無法載入帳本，請重新整理。');});
  },[]);
  async function send(action:string,fields:Record<string,unknown>,done:string):Promise<Ledger|undefined> {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setData(result);setError(false);setMessage(done);return result;
    } catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'操作失敗');return undefined;}
    finally{setBusy(false);}
  }
  function navigate(next:typeof tab){setTab(next);setReview(undefined);setMessage('');window.scrollTo(0,0);}
  function openDraft(record:Draft){setTab('帳單');setReview({record,editing:false});setMessage('');}
  function editBill(record:Bill){setTab('帳單');setReview({record,editing:true});setMessage('');}
  const section=sections.find(item=>item.title===tab)!;
  const report=data&&month?summarize(data,month):undefined;
  const activeBills=data?.bills.filter(bill=>!bill.voidedOn)??[];
  const unpaid=activeBills.filter(bill=>!bill.paidOn&&!bill.coveredByCard).sort((a,b)=>a.due.localeCompare(b.due));
  const monthlyBills=activeBills.filter(bill=>bill.month===month);
  const pending=data?.drafts.filter(draft=>draft.source!=='bank'&&draft.month===month)??[];
  const expected=data?checklist(data,month):[];
  const missing=expected.filter(item=>!item.bill);
  const canComplete=missing.length===0&&pending.length===0;
  const investment=data?.investments?.[month];
  const monthlyTrend=data&&<MonthlyTrend month={month} totals={data.totals} onMonth={setMonth}/>;
  const completion=data&&report&&<section className="panel completeness" aria-label="本月資料完整度">
    <div className="section-title"><h2>{month} 資料確認</h2><span className={'badge '+(report.billsComplete?'':'pending')}>{report.billsComplete?'帳單已收齊':'帳單待確認'}</span></div>
    <p>{report.billsComplete?'已確認這個月的帳單完整；日後新增或修改帳單會重新開啟確認。':`已核對 ${monthlyBills.length} 份帳單${missing.length?'，固定清單尚缺 '+missing.length+' 份':''}。只收到部分帳單時，支出總額仍可能增加。`}</p>
    <div className="status-chips"><span>薪資：{report.salaryReceived?'已入帳':'預估'}</span><span>投入：{report.investment===null?'待填寫':'已填寫'}</span><span>股息：{report.dividends===null?'待填寫':'已填寫'}</span></div>
    <button disabled={busy||(!report.billsComplete&&!canComplete)} onClick={()=>send('complete_month',{month,complete:!report.billsComplete},report.billsComplete?'已重新開啟本月帳單確認。':'已確認本月帳單收齊。')}>{report.billsComplete?'重新開啟確認':'確認本月帳單已收齊'}</button>
    {!canComplete&&<small>請先核對草稿並補齊固定帳單。</small>}
    {!data.schedules?.length&&<small>尚未設定固定清單，確認前請自行檢查是否缺漏；本月確實沒有帳單也可確認為 0。</small>}
  </section>;

  return <div className="shell"><aside>
    <div className="brand"><span><Icon name="brand"/></span><div>家用帳本<small>HOUSEHOLD LEDGER</small></div></div>
    <nav aria-label="主要導覽">{sections.map(item=><button key={item.title} className={tab===item.title?'active':''} aria-current={tab===item.title?'page':undefined} onClick={()=>navigate(item.title)}><Icon name={item.icon}/>{item.title}</button>)}</nav>
    <div className="side-note"><b>本機示範</b><p>假資料儲存在此電腦，尚未連接雲端。</p><button className="text-button" disabled={busy||!data} onClick={async()=>{if(window.confirm('要清除示範操作並重設嗎？'))if(await send('reset',{},'已恢復示範資料。')){setReview(undefined);setPhoto(undefined);}}}>重設示範資料</button></div>
  </aside><main>
    <header><div><div className="eyebrow">家庭財務工作台</div><h1>{tab==='總覽'?'收支總覽':tab}</h1><p>{section.hint}</p></div><span className="badge demo-badge">本機 Demo</span></header>
    {message&&<p className={'notice '+(error?'error':'')} role={error?'alert':'status'}>{message}</p>}
    {!data&&!message&&<p role="status">載入中…</p>}
    {data&&report&&<>
      <div className="month"><label><Icon name="calendar"/>查看月份<input aria-label="查看月份" type="month" value={month} min="2000-01" max="2099-12" onInput={event=>{if(event.currentTarget.value){setMonth(event.currentTarget.value);setReview(undefined);}}} onChange={event=>{if(event.target.value){setMonth(event.target.value);setReview(undefined);}}}/></label><span>金額以新臺幣顯示</span></div>
      {tab==='總覽'&&<section className="next-action todo-summary" aria-label="優先待辦">
        <div><b>{data.drafts.filter(item=>item.source!=='bank').length} 份待核對</b><small>{missing.length?'本期固定清單缺 '+missing.length+' 份':'查看本期帳單是否完整'}</small><button onClick={()=>navigate('帳單')}>處理帳單</button></div>
        <div><b>未繳合計 {money(unpaid.reduce((sum,bill)=>sum+bill.amount,0))}</b><small>包含所有月份與待自動扣款</small><small>{unpaid[0]?'最近期限 '+unpaid[0].due:'目前沒有待繳帳單'}</small></div>
      </section>}
      {tab!=='帳單'&&<section className="stats" aria-label="每月收支">{[
        {label:'收入（含預估）',value:money(report.income),detail:(report.salaryReceived?'薪資已入帳':'薪資預估')+' · '+(report.dividends===null?'股息待填寫':'股息已填寫'),icon:'income' as const},
        {label:'帳單支出',value:report.hasBills||report.billsComplete?money(report.expenses):'待補資料',detail:report.billsComplete?'已收齊，含未繳帳單':'已收到的金額，尚未收齊',icon:'expense' as const},
        {label:'股票投入',value:report.investment===null?'待填寫':money(report.investment),detail:'從生活資金新撥入投資的金額',icon:'report' as const},
        {label:'預估可分配餘額',value:report.balance===null?'待補資料':money(report.balance),detail:report.balance===null?'請確認帳單並填寫投入、股息':'收入－帳單－投入，非銀行餘額',icon:'balance' as const},
      ].map(item=><article className={'metric '+item.icon} key={item.label}><div className="metric-title"><p>{item.label}</p><span className="icon-tile"><Icon name={item.icon}/></span></div><strong>{item.value}</strong><small>{item.detail}</small></article>)}</section>}
      {tab==='總覽'&&<>
        {completion}
        <section className="panel"><Checklist data={data} month={month} busy={busy} send={send} openDraft={openDraft} editBill={editBill}/><button className="text-button" onClick={()=>navigate('帳單')}>設定固定清單／新增帳單</button></section>
        <section className="panel"><h2>所有未繳帳單 <span className="count">{unpaid.length}</span></h2><p>依期限排序。待扣款需確認成功後才記為已繳。</p>{!unpaid.length&&<p>目前沒有待繳帳單。</p>}<BillList bills={unpaid} busy={busy} send={send} edit={editBill}/></section>
        {monthlyTrend}
      </>}
      {tab==='帳單'&&<>
        {review&&<BillEditor key={review.record.id+'-'+review.editing} record={review.record} editing={review.editing} data={data} busy={busy} send={send} close={()=>setReview(undefined)}/>}
        <div className="import-grid">
          <section className="panel"><h2>紙本帳單</h2><p>先用範例帶入欄位供核對。附上的照片會保存在本機，之後可回看。</p>
            <form onSubmit={async event=>{
              event.preventDefault();const title=new FormData(event.currentTarget).get('title');let attachmentId:string|undefined;
              if(photo){setBusy(true);setMessage('');try{const body=new FormData();body.set('file',photo);const response=await fetch('/api/attachments',{method:'POST',body});const result=await response.json();if(!response.ok)throw new Error(result.error);attachmentId=result.id;}catch(cause){setError(true);setMessage(cause instanceof Error?cause.message:'照片上傳失敗');setBusy(false);return;}}
              const result=await send('paper',{title,month,attachmentId},'已帶入範例，請對照帳單核對。');if(result){openDraft(result.drafts[result.drafts.length-1]);setPhoto(undefined);}
            }}>
              <label>帳單樣本<select name="title">{paperSamples.map(item=><option key={item.title}>{item.title}</option>)}</select></label>
              <label>照片（選填，8 MB 以下）<input key={photo?'selected':'empty'} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event=>setPhoto(event.target.files?.[0])}/></label>
              {photo&&<small>已選擇：{photo.name}</small>}
              <button className="primary" disabled={busy}>開始核對紙本</button>
            </form>
          </section>
          <section className="panel"><h2>Drive 帳單匯入</h2><p>模擬取得一份信用卡帳單。正式 Drive 與辨識會在 Demo 確認後接入。</p><button className="primary" disabled={busy} onClick={()=>send('sync',{},data.synced?'沒有新的示範帳單。':'已取得信用卡範例，請在待核對清單開啟。')}>模擬立即同步</button></section>
        </div>
        <section className="panel"><h2>待核對帳單</h2>{!data.drafts.length&&<p>目前沒有待核對帳單。</p>}{data.drafts.map(draft=><div className="record" key={draft.id}><div><b>{draft.title}</b><small>{draft.month}{draft.source==='bank'?' · 存款對帳單，僅供查閱':''}</small></div><button disabled={busy} onClick={()=>openDraft(draft)}>{draft.source==='bank'?'查看':'核對'}</button></div>)}</section>
        <ScheduleSettings data={data} month={month} busy={busy} send={send}/>
        <section className="panel"><Checklist data={data} month={month} busy={busy} send={send} openDraft={openDraft} editBill={editBill}/></section>
        {completion}
        <section className="panel"><h2>{month} 已核對帳單</h2><p>包含已繳與未繳；金額有誤可修改，誤按已繳可撤銷。</p><BillList bills={monthlyBills} busy={busy} send={send} edit={editBill}/>{!monthlyBills.length&&<p>尚未儲存本月帳單。</p>}</section>
        <details className="panel"><summary>作廢清單（{data.bills.filter(b=>b.voidedOn).length}）</summary><p>作廢帳單不列入支出，仍保留原檔與欄位。</p><BillList bills={data.bills.filter(b=>b.voidedOn)} busy={busy} send={send} edit={editBill}/></details>
      </>}
      {tab==='薪資與投資'&&<>
        <section className="panel"><h2>{month} 股票投入與股息</h2><p>投入＝本月從生活資金新撥入投資的金額；賣出後再買進不重複計入。股息填實際收到的總額。</p>
          <p>還不確定請留白；確定沒有投入或股息，請填 0。</p>
          <form key={month+'-investment'} className="inline" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);await send('investment',{month,amount:optionalAmount(form.get('amount')),dividends:optionalAmount(form.get('dividends'))},'已儲存；留白的欄位仍標示待填寫。');}}>
            <label>本月新投入<input name="amount" type="number" min="0" max="999999999" step="1" placeholder="尚未填寫" defaultValue={investment?.amount??''}/></label>
            <label>本月股息<input name="dividends" type="number" min="0" max="999999999" step="1" placeholder="尚未填寫" defaultValue={investment?.dividends??''}/></label>
            <button disabled={busy} className="primary">儲存投資與股息</button>
          </form>
        </section>
        <section className="panel"><h2>{month} 薪資 <span className="badge">{report.salaryReceived?'已入帳':'預估'}</span></h2><p>預設月薪 {money(data.salary)}。填入實際入帳日才標示已入帳；留白仍為預估。收入歸屬所選月份。</p>
          <form key={month+'-salary'} className="inline" onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);await send('salary',{month,amount:Number(form.get('amount')),receivedOn:form.get('receivedOn')},'已更新薪資金額與入帳狀態。');}}>
            <label>薪資金額<input name="amount" type="number" min="0" max="999999999" step="1" required defaultValue={report.salary}/></label>
            <label>實際入帳日（未入帳留白）<input name="receivedOn" type="date" max={today} defaultValue={data.salaryReceipts?.[month]??''}/></label>
            <button disabled={busy} className="primary">儲存薪資</button>
          </form>
        </section>
        {completion}{monthlyTrend}
      </>}
    </>}
  </main></div>;
}
