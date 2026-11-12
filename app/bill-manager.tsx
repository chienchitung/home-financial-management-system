import { useRef, useEffect, useState } from 'react';
import { TrackedForm, useFormSafety } from './form-safety';
import type { Bill, Draft, Ledger, Schedule, SendAction } from '../lib/model';
import { checklist, isExpected, money, taipeiToday } from '../lib/summary';

export function BillEditor({ record, data, editing, busy, send, close }: {
  record: Draft; data: Ledger; editing: boolean; busy: boolean; send: SendAction; close: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const { guard, dirty } = useFormSafety();
  const editor = useRef<HTMLElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(record.month);
  const [source, setSource] = useState(record.source);
  const [scheduleId, setScheduleId] = useState(record.scheduleId ?? '');
  useEffect(() => { heading.current?.focus(); }, []);
  const original = record.original ?? record;
  function fields(form: FormData) { return { id: record.id, title: form.get("title"), source, month: selectedMonth,
    amount: String(form.get("amount") ?? "").trim() === "" ? null : Number(form.get("amount")), due: form.get("due"), scheduleId,
    autoDebit: form.get("autoDebit") === "on", coveredByCard: form.get("coveredByCard") === "on" }; }
  return <section ref={editor} className="panel review" aria-label={editing ? '修改帳單' : '核對草稿'}>
    <div className="section-title"><h2 ref={heading} tabIndex={-1}>{editing ? '修改' : '核對'} {record.title || '新帳單'}</h2><button disabled={busy} onClick={() => guard(close, editor.current?.querySelector('form'))}>{editing ? '關閉' : '返回清單'}</button></div>
    <div className="review-grid">
      <div className="source">
        <h3>原始來源</h3>
        {record.attachmentId ? <>
          {!previewFailed && <img src={'/api/attachments/'+record.attachmentId} alt="原始帳單照片" onError={() => setPreviewFailed(true)}/>}
          {previewFailed && <p>此格式無法直接預覽，可下載原檔查看。</p>}
          <a href={'/api/attachments/'+record.attachmentId} target="_blank" rel="noreferrer">開啟／下載原始照片</a>
        </> : <p>{record.manual?'這是手動填寫的帳單，沒有附上原檔。':'此筆沒有留存原檔。以下為初次帶入的欄位。'}</p>}
        {!record.manual&&<p>初次帶入：{original.title} · {original.month} · {money(original.amount)} · 期限 {original.due || '未提供'}</p>}
      </div>
      {record.source === 'bank' ? <div><p>存款對帳單只供核對，不計入帳單支出。</p>{record.rows?.map(row=><p key={row.id}>{row.date} · {row.label} · {money(row.amount)}</p>)}</div> :
      <TrackedForm onSave={async form => !!await send(editing ? 'edit_bill' : 'confirm', fields(form),
        editing ? '已更新帳單，請重新確認本月是否完整。' : '帳單已儲存。')} onSaved={close}>
        <label>帳單名稱<input name="title" maxLength={100} required defaultValue={record.title}/></label>
        <label>類型<select value={source} onChange={event=>{setSource(event.target.value as Draft['source']);setScheduleId('');}}><option value="paper">固定帳單</option><option value="card">信用卡</option></select></label>
        <label>帳單月份<input type="month" required value={selectedMonth} onInput={event=>{setSelectedMonth(event.currentTarget.value);setScheduleId('');}} onChange={event=>{setSelectedMonth(event.target.value);setScheduleId('');}}/></label>
        <label>屬於哪個固定項目？<select value={scheduleId} onChange={event=>setScheduleId(event.target.value)}><option value="">單次帳單／尚未對應</option>{(data.schedules??[]).filter(item=>isExpected(item,selectedMonth)&&item.source===source).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>應繳金額<input name="amount" type="number" min="0" max="999999999" step="1" required defaultValue={!editing && (record.amountUnfilled || (record.scheduleId && record.amount===0 && !record.original)) ? '' : record.amount}/></label>
        <label>繳費期限<input name="due" type="date" required defaultValue={record.due}/></label>
        <label className="check-label"><input name="autoDebit" type="checkbox" defaultChecked={record.autoDebit}/>自動扣款</label>
        {source==='paper' && <label className="check-label"><input name="coveredByCard" type="checkbox" defaultChecked={record.coveredByCard}/>由信用卡代繳（含於卡費，不另計支出）</label>}
        <button className="primary" disabled={busy}>{editing ? '儲存修改' : '儲存到帳本'}</button>
        {editing && <button type="button" className="danger-text" disabled={busy} onClick={async()=>{
          if (window.confirm('移除後不再計入支出，仍可從已移除清單恢復。')) if(await send('void_bill',{id:record.id},'已移除帳單，可在已移除清單恢復。')) close();
        }}>移除此帳單</button>}
        {!editing && <><button type="button" disabled={busy} onClick={async () => {
          const form = editor.current?.querySelector('form');
          if (form && await send('save_draft', fields(new FormData(form)), '已保留草稿，稍後可從待核對清單繼續。')) { dirty.delete(form); close(); }
        }}>保留，稍後再填</button><button type="button" className="danger-text" disabled={busy} onClick={async () => {
          if (window.confirm('確定刪除這份草稿？尚未列入支出，刪除後需重新新增。')) {
            if (await send('delete_draft', { id: record.id }, '已刪除草稿。')) close();
          }
        }}>刪除草稿</button></>}
      </TrackedForm>}
    </div>
  </section>;
}

/** One status vocabulary for saved bills: 待繳 → 逾期 (past due) → 已繳; plus 含於卡費 and 已移除. */
export function billStatus(bill: Bill, today: string) {
  if (bill.voidedOn) return { label: '已移除', tone: 'muted' };
  if (bill.coveredByCard) return { label: '含於卡費', tone: 'muted' };
  if (bill.paidOn) return { label: '已繳', tone: 'done' };
  return bill.due < today ? { label: '逾期', tone: 'overdue' } : { label: '待繳', tone: 'pending' };
}

export function BillList({ bills, busy, send, edit, showMonth }: { bills: Bill[]; busy: boolean; send: SendAction; edit: (bill: Bill)=>void; showMonth?: boolean }) {
  const [payId, setPayId] = useState('');
  const { guard } = useFormSafety();
  const today = taipeiToday();
  return <>{bills.map(bill=>{ const status = billStatus(bill, today); return <div className="record" key={bill.id}>
    <div><button type="button" className="row-link" title="查看或修改" disabled={busy} onClick={()=>edit(bill)}>{bill.title}</button>
      <small>{[showMonth?bill.month:'', bill.paidOn?'已繳 '+bill.paidOn:'期限 '+bill.due, bill.autoDebit&&!bill.paidOn?'自動扣款':''].filter(Boolean).join(' · ')}</small></div>
    <span className={'badge '+status.tone}>{status.label}</span>
    <strong>{money(bill.amount)}</strong>
    <div className="record-actions">
      {bill.voidedOn ? <button disabled={busy} onClick={()=>send('restore_bill',{id:bill.id},'已恢復帳單，請重新確認本月是否收齊。')}>恢復帳單</button>
        : bill.paidOn ? <button className="text-button" disabled={busy} onClick={()=>send('unpay',{id:bill.id},'已撤銷繳款紀錄，支出金額不變。')}>撤銷已繳</button>
        : !bill.coveredByCard && payId!==bill.id && <button disabled={busy} onClick={()=>guard(()=>setPayId(bill.id))}>記為已繳</button>}
    </div>
    {payId===bill.id && !bill.paidOn && !bill.voidedOn && <TrackedForm className="inline payment-form" onSave={async form => !!await send('pay',{id:bill.id,date:form.get('date')},'已記為已繳。')} onSaved={()=>setPayId('')}><label>{bill.autoDebit?'扣款日':'繳款日'}<input name="date" type="date" required max={today} defaultValue={today}/></label><button disabled={busy} className="primary">儲存繳款</button><button type="button" onClick={event=>guard(()=>setPayId(''),event.currentTarget.closest('form'))}>取消</button></TrackedForm>}
  </div>;})}</>;
}

export function MonthBills({ data, month, busy, send, openDraft, editBill }: {
  data: Ledger; month: string; busy: boolean; send: SendAction; openDraft:(draft:Draft)=>void; editBill:(bill:Bill)=>void;
}) {
  const notReceived = checklist(data,month).filter(item=>!item.bill&&!item.draft);
  const drafts = data.drafts.filter(draft=>draft.source!=='bank'&&draft.month===month);
  const bills = data.bills.filter(bill=>!bill.voidedOn&&bill.month===month)
    .sort((a,b)=>Number(!!a.paidOn||!!a.coveredByCard)-Number(!!b.paidOn||!!b.coveredByCard)||a.due.localeCompare(b.due));
  if (!notReceived.length && !drafts.length && !bills.length) return <p className="empty-state">
    {data.schedules?.length ? '本月沒有排定的固定帳單。' : '本月還沒有帳單。按「新增帳單」開始，或先設定固定帳單，系統會提醒缺漏。'}
  </p>;
  return <div className="bill-rows">
    {notReceived.map(item=><div className="record" key={'schedule-'+item.id}>
      <div><b>{item.title}</b><small>每期 {item.dueDay} 日</small></div>
      <span className="badge muted">尚未收到</span>
      <div className="record-actions"><button disabled={busy} onClick={async()=>{
        const result=await send('schedule_draft',{id:item.id,month},'已建立待核對帳單，請填入實際金額。');
        const draft=result?.drafts.find(d=>d.scheduleId===item.id&&d.month===month);if(draft)openDraft(draft);
      }}>加入帳單</button></div>
    </div>)}
    {drafts.map(draft=><DraftRow key={draft.id} draft={draft} busy={busy} open={()=>openDraft(draft)}/>)}
    <BillList bills={bills} busy={busy} send={send} edit={editBill}/>
  </div>;
}

export function DraftRow({ draft, busy, open, showMonth }: { draft: Draft; busy: boolean; open: ()=>void; showMonth?: boolean }) {
  const bank = draft.source==='bank';
  return <div className="record">
    <div><button type="button" className="row-link" disabled={busy} onClick={open}>{draft.title || '未命名帳單'}</button>
      <small>{[showMonth?draft.month:'', bank?'存款對帳單，僅供查閱':draft.due?'期限 '+draft.due:''].filter(Boolean).join(' · ')}</small></div>
    {!bank&&<span className="badge pending">待核對</span>}
    {!bank&&!draft.amountUnfilled&&draft.amount>0&&<strong>{money(draft.amount)}</strong>}
    <div className="record-actions"><button disabled={busy} onClick={open}>{bank?'查看':'核對'}</button></div>
  </div>;
}

export function ScheduleSettings({ data, month, busy, send, next, close }: { data: Ledger; month: string; busy: boolean; send: SendAction; next: () => void; close: () => void }) {
  const [editing,setEditing]=useState<Schedule>();
  const [saved,setSaved]=useState(false);
  const { guard } = useFormSafety();
  const settings = useRef<HTMLElement>(null);
  const [formVersion,setFormVersion]=useState(0);
  return <section ref={settings} id="fixed-settings" className="panel" aria-label="固定帳單設定">
    <div className="section-title"><h2 tabIndex={-1}>固定帳單設定（{data.schedules?.length ?? 0} 項）</h2><button disabled={busy} onClick={()=>guard(close,settings.current?.querySelector('form'))}>關閉設定</button></div>
    <p>用來提醒每月缺哪些帳單，不會自動產生支出。</p>
    {(data.schedules??[]).map(item=><div className="record compact" key={item.id}><div><b>{item.title}</b><small>{item.interval===1?'每月':item.interval===2?'每兩月':'每年'} · {item.startMonth} 起{item.endMonth?'，至 '+item.endMonth:''} · 每期 {item.dueDay} 日</small></div><button disabled={busy} onClick={()=>guard(()=>{setEditing(item);setSaved(false);},settings.current?.querySelector("form"))}>修改週期</button></div>)}
    <TrackedForm className="settings-form" key={editing?.id??formVersion} onSave={async form =>
      !!await send('schedule',{id:editing?.id,title:form.get('title'),source:form.get('source'),startMonth:form.get('startMonth'),endMonth:form.get('endMonth'),interval:Number(form.get('interval')),dueDay:Number(form.get('dueDay')),autoDebit:form.get('autoDebit')==='on',coveredByCard:form.get('coveredByCard')==='on'},'已儲存固定清單。')}
      onSaved={()=>{setEditing(undefined);setFormVersion(value=>value+1);setSaved(true);requestAnimationFrame(()=>settings.current?.querySelector(".saved-next")?.scrollIntoView({block:"nearest"}));}}>
      <h3>{editing?'修改固定帳單':'新增固定帳單'}</h3>
      <label>名稱<input name="title" required maxLength={100} placeholder="例如：電費、台新信用卡" defaultValue={editing?.title}/></label>
      <label>類型<select name="source" defaultValue={editing?.source??'paper'}><option value="paper">固定帳單</option><option value="card">信用卡</option></select></label>
      <label>週期<select name="interval" defaultValue={editing?.interval??1}><option value="1">每月</option><option value="2">每兩月</option><option value="12">每年</option></select></label>
      <label>起始月份<input type="month" name="startMonth" required defaultValue={editing?.startMonth??month}/></label>
      <label>最後一期（選填）<input type="month" name="endMonth" defaultValue={editing?.endMonth}/></label>
      <label>每期繳費日<input type="number" name="dueDay" min="1" max="31" step="1" required defaultValue={editing?.dueDay??20}/></label>
      <label className="check-label"><input type="checkbox" name="autoDebit" defaultChecked={editing?.autoDebit}/>自動扣款</label>
      <label className="check-label"><input type="checkbox" name="coveredByCard" defaultChecked={editing?.coveredByCard}/>固定帳單由信用卡代繳</label>
      <div className="inline"><button className="primary" disabled={busy}>{editing?'儲存週期':'加入固定清單'}</button>{editing&&<button type="button" onClick={()=>guard(()=>setEditing(undefined),settings.current?.querySelector("form"))}>取消修改</button>}</div>
    </TrackedForm>
    {saved && <div className="saved-next" role="status"><span>已儲存。下一步填寫本月金額。</span><button onClick={next}>前往加入本月帳單</button></div>}
  </section>;
}
