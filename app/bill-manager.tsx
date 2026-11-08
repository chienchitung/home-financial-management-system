import { useRef, useEffect, useState } from 'react';
import type { Bill, Draft, Ledger, Schedule, SendAction } from '../lib/model';
import { checklist, isExpected, money, taipeiToday } from '../lib/summary';

export function BillEditor({ record, data, editing, busy, send, close }: {
  record: Draft; data: Ledger; editing: boolean; busy: boolean; send: SendAction; close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(record.month);
  const [source, setSource] = useState(record.source);
  const [scheduleId, setScheduleId] = useState(record.scheduleId ?? '');
  useEffect(() => { heading.current?.focus(); }, []);
  const original = record.original ?? record;
  return <section className="panel review" aria-label={editing ? '修改帳單' : '核對草稿'}>
    <div className="section-title"><h2 ref={heading} tabIndex={-1}>{editing ? '修改' : '核對'} {record.title}</h2><button onClick={close}>關閉</button></div>
    <div className="review-grid">
      <div className="source">
        <h3>原始來源</h3>
        {record.attachmentId ? <>
          {!previewFailed && <img src={'/api/attachments/'+record.attachmentId} alt="原始帳單照片" onError={() => setPreviewFailed(true)}/>}
          {previewFailed && <p>此格式無法直接預覽，可下載原檔查看。</p>}
          <a href={'/api/attachments/'+record.attachmentId} target="_blank" rel="noreferrer">開啟／下載原始照片</a>
        </> : <p>此筆沒有留存原檔。以下為初次帶入的欄位。</p>}
        <p>{original.title}<br/>{original.month} · {money(original.amount)}<br/>期限 {original.due || '未提供'}</p>
      </div>
      {record.source === 'bank' ? <div><p>存款對帳單只供核對，不計入帳單支出。</p>{record.rows?.map(row=><p key={row.id}>{row.date} · {row.label} · {money(row.amount)}</p>)}</div> :
      <form onSubmit={async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        if (await send(editing ? 'edit_bill' : 'confirm', { id: record.id, title: form.get('title'), source,
          month: selectedMonth, amount: Number(form.get('amount')), due: form.get('due'), scheduleId,
          autoDebit: form.get('autoDebit') === 'on', coveredByCard: form.get('coveredByCard') === 'on' },
          editing ? '已更新帳單，請重新確認本月是否收齊。' : '帳單已儲存。')) close();
      }}>
        <label>帳單名稱<input name="title" maxLength={100} required defaultValue={record.title}/></label>
        <label>類型<select value={source} onChange={event=>{setSource(event.target.value as Draft['source']);setScheduleId('');}}><option value="paper">固定帳單</option><option value="card">信用卡</option></select></label>
        <label>帳單月份<input type="month" required value={selectedMonth} onInput={event=>{setSelectedMonth(event.currentTarget.value);setScheduleId('');}} onChange={event=>{setSelectedMonth(event.target.value);setScheduleId('');}}/></label>
        <label>對應固定帳單<select value={scheduleId} onChange={event=>setScheduleId(event.target.value)}><option value="">單次帳單／尚未對應</option>{(data.schedules??[]).filter(item=>isExpected(item,selectedMonth)&&item.source===source).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>應繳金額<input name="amount" type="number" min="0" max="999999999" step="1" required defaultValue={!editing && record.scheduleId && record.amount===0 ? '' : record.amount}/></label>
        <label>繳費期限<input name="due" type="date" required defaultValue={record.due}/></label>
        <label className="check-label"><input name="autoDebit" type="checkbox" defaultChecked={record.autoDebit}/>自動扣款（確認扣款後才記為已繳）</label>
        {source==='paper' && <label className="check-label"><input name="coveredByCard" type="checkbox" defaultChecked={record.coveredByCard}/>信用卡代繳（費用已含於卡費，不另計支出）</label>}
        <button className="primary" disabled={busy}>{editing ? '儲存修改' : '儲存到帳本'}</button>
        {editing && <button type="button" className="danger-text" disabled={busy} onClick={async()=>{
          if (window.confirm('作廢後不再計入支出，仍可從作廢清單恢復。')) if(await send('void_bill',{id:record.id},'已作廢帳單，可在作廢清單恢復。')) close();
        }}>作廢這張帳單</button>}
      </form>}
    </div>
  </section>;
}

export function BillList({ bills, busy, send, edit }: { bills: Bill[]; busy: boolean; send: SendAction; edit: (bill: Bill)=>void }) {
  const [payId, setPayId] = useState('');
  const today = taipeiToday();
  return <>{bills.map(bill=><div className="record" key={bill.id}>
    <div><b>{bill.title}</b><small>{bill.month} · 期限 {bill.due}</small>{bill.paidOn && <small>繳款日 {bill.paidOn}</small>}</div>
    <span className={'badge '+(!bill.paidOn&&!bill.coveredByCard&&bill.due<today?'overdue':'pending')}>{bill.voidedOn?'已作廢':bill.coveredByCard?'信用卡代繳':bill.paidOn?'已繳':bill.autoDebit?(bill.due<today?'扣款待確認':'待扣款'):(bill.due<today?'已逾期':'待繳')}</span>
    <strong>{money(bill.amount)}</strong>
    <div className="record-actions">
      {bill.voidedOn ? <button disabled={busy} onClick={()=>send('restore_bill',{id:bill.id},'已恢復帳單，請重新確認本月是否收齊。')}>恢復帳單</button> : <>
        <button disabled={busy} onClick={()=>edit(bill)}>修改／原檔</button>
        {bill.paidOn && <button disabled={busy} onClick={()=>send('unpay',{id:bill.id},'已撤銷繳款紀錄，支出金額不變。')}>撤銷已繳</button>}
        {!bill.paidOn && !bill.coveredByCard && payId!==bill.id && <button disabled={busy} onClick={()=>setPayId(bill.id)}>{bill.autoDebit?'確認已扣款':'記為已繳'}</button>}
      </>}
    </div>
    {payId===bill.id && !bill.paidOn && !bill.voidedOn && <form className="inline payment-form" onSubmit={async event=>{
      event.preventDefault(); if(await send('pay',{id:bill.id,date:new FormData(event.currentTarget).get('date')},'已儲存繳款紀錄，沒有重複增加支出。')) setPayId('');
    }}><label>實際繳款日<input name="date" type="date" required max={today} defaultValue={today}/></label><button disabled={busy} className="primary">儲存繳款</button><button type="button" onClick={()=>setPayId('')}>取消</button></form>}
  </div>)}</>;
}

export function Checklist({ data, month, busy, send, openDraft, editBill }: {
  data: Ledger; month: string; busy: boolean; send: SendAction; openDraft:(draft:Draft)=>void; editBill:(bill:Bill)=>void;
}) {
  const items = checklist(data,month);
  const received = items.filter(item=>item.bill).length;
  return <div className="checklist">
    <h3>本期固定帳單 · 已收到 {received}／{items.length} 份</h3>
    {!items.length && <p>{data.schedules?.length ? '本月沒有排定的固定帳單；仍可加入單次帳單。' : '先設定常收到的帳單，系統才能幫你檢查缺漏。'}</p>}
    {items.map(item=><div className="record compact" key={item.id}><div><b>{item.title}</b><small>{item.bill?'已收到':item.draft?'待核對':'尚未收到'}</small></div>
      <button disabled={busy} onClick={async()=>{
        if(item.bill) editBill(item.bill);
        else if(item.draft) openDraft(item.draft);
        else {const result=await send('schedule_draft',{id:item.id,month},'已建立待核對帳單，請填入實際金額。');const draft=result?.drafts.find(d=>d.scheduleId===item.id&&d.month===month);if(draft)openDraft(draft);}
      }}>{item.bill?'查看':item.draft?'核對':'加入帳單'}</button></div>)}
  </div>;
}

export function ScheduleSettings({ data, month, busy, send }: { data: Ledger; month: string; busy: boolean; send: SendAction }) {
  const [editing,setEditing]=useState<Schedule>();
  const [formVersion,setFormVersion]=useState(0);
  return <details className="panel" open={!data.schedules?.length || !!editing}>
    <summary>設定固定帳單（{data.schedules?.length ?? 0} 項）</summary>
    <p>設定週期只用來檢查缺漏，不會自行產生支出。每兩月／每年從起始月份計算；31 日遇短月取月底。</p>
    {(data.schedules??[]).map(item=><div className="record compact" key={item.id}><div><b>{item.title}</b><small>{item.interval===1?'每月':item.interval===2?'每兩月':'每年'} · {item.startMonth} 起{item.endMonth?'，至 '+item.endMonth:''} · 每期 {item.dueDay} 日</small></div><button onClick={()=>setEditing(item)}>修改週期</button></div>)}
    <form className="settings-form" key={editing?.id??formVersion} onSubmit={async event=>{
      event.preventDefault(); const form=new FormData(event.currentTarget);
      if(await send('schedule',{id:editing?.id,title:form.get('title'),source:form.get('source'),startMonth:form.get('startMonth'),endMonth:form.get('endMonth'),interval:Number(form.get('interval')),dueDay:Number(form.get('dueDay')),autoDebit:form.get('autoDebit')==='on',coveredByCard:form.get('coveredByCard')==='on'},'已更新固定帳單清單；既有帳單保留，月份收齊狀態需重新確認。')) {setEditing(undefined);setFormVersion(value=>value+1);}
    }}>
      <h3>{editing?'修改固定帳單':'新增固定帳單'}</h3>
      <label>名稱<input name="title" required maxLength={100} placeholder="例如：電費、台新信用卡" defaultValue={editing?.title}/></label>
      <label>類型<select name="source" defaultValue={editing?.source??'paper'}><option value="paper">固定帳單</option><option value="card">信用卡</option></select></label>
      <label>週期<select name="interval" defaultValue={editing?.interval??1}><option value="1">每月</option><option value="2">每兩月</option><option value="12">每年</option></select></label>
      <label>起始月份<input type="month" name="startMonth" required defaultValue={editing?.startMonth??month}/></label>
      <label>最後一期（選填）<input type="month" name="endMonth" defaultValue={editing?.endMonth}/></label>
      <label>每期繳費日<input type="number" name="dueDay" min="1" max="31" step="1" required defaultValue={editing?.dueDay??20}/></label>
      <label className="check-label"><input type="checkbox" name="autoDebit" defaultChecked={editing?.autoDebit}/>自動扣款</label>
      <label className="check-label"><input type="checkbox" name="coveredByCard" defaultChecked={editing?.coveredByCard}/>固定帳單由信用卡代繳</label>
      <div className="inline"><button className="primary" disabled={busy}>{editing?'儲存週期':'加入固定清單'}</button>{editing&&<button type="button" onClick={()=>setEditing(undefined)}>取消修改</button>}</div>
    </form>
  </details>;
}
