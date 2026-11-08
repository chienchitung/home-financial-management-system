import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { paperSamples, type Draft, type Ledger, type Schedule, type Snapshot } from './model';
import { checklist, isExpected, shiftMonth, summarize, taipeiToday } from './summary';

export const directory = process.env.DEMO_DATA_DIR || join(process.cwd(), '.demo-data');
const path = join(directory, 'ledger.json');
const month = taipeiToday().slice(0, 7);
const seed: Snapshot = {
  month, salary: 68000, synced: false, drafts: [], schedules: [],
  bills: [{ id: 'water', title: '臺北自來水', month, due: month + '-16', amount: 220, source: 'paper' }],
  entries: [],
};
export function read(): Snapshot {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return structuredClone(seed);
  }
}
function save(data: Snapshot) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Preserve the pre-upgrade data once, before the first write with the new fields.
  if (existsSync(path) && !existsSync(path + '.before-v020')) {
    writeFileSync(path + '.before-v020', readFileSync(path), { mode: 0o600 });
  }
  writeFileSync(path + '.tmp', JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(path + '.tmp', path);
}
function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const amountValid = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 999999999;
const dateValid = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(v);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === v;
};
const validMonth = (v: unknown): v is string => typeof v === 'string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(v);
const titleValid = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 100;
function reopen(data: Snapshot, ...months: string[]) { for (const key of months) if (data.completedMonths) delete data.completedMonths[key]; }
function original(draft: Draft) { return draft.original ?? { title: draft.title, month: draft.month, due: draft.due, amount: draft.amount }; }
function billFields(data: Snapshot, input: Record<string, unknown>, bill: Draft) {
  requireValue(titleValid(input.title) && validMonth(input.month) && dateValid(input.due) && amountValid(input.amount), '請核對名稱、月份、金額及期限。');
  requireValue(input.source === 'paper' || input.source === 'card', '請選擇固定帳單或信用卡。');
  const scheduleId = typeof input.scheduleId === 'string' && input.scheduleId ? input.scheduleId : undefined;
  const schedule = data.schedules?.find(item => item.id === scheduleId);
  if (scheduleId) {
    requireValue(schedule && isExpected(schedule, input.month) && schedule.source === input.source, '固定帳單項目與月份或類型不符，請重新選擇。');
    requireValue(!data.bills.some(item => !item.voidedOn && item.id !== bill.id && item.month === input.month && item.scheduleId === scheduleId), '這個固定帳單本期已存在，請修改既有帳單。');
  }
  return { title: input.title.trim(), month: input.month, due: input.due, amount: input.amount,
    source: input.source, scheduleId, autoDebit: input.autoDebit === true,
    coveredByCard: input.source === 'paper' && input.coveredByCard === true } as const;
}
export function mutate(input: Record<string, unknown>) {
  const data = read();
  switch (input.action) {
    case 'paper': {
      const sample = paperSamples.find(item => item.title === input.title);
      requireValue(sample, '請選擇紙本樣本。');
      requireValue(validMonth(input.month), '請選擇月份。');
      const attachmentId = typeof input.attachmentId === 'string' ? input.attachmentId : undefined;
      if (attachmentId) requireValue(/^[a-f0-9-]{36}$/.test(attachmentId) && existsSync(join(directory, 'attachments', attachmentId + '.json')), '照片不存在，請重新上傳。');
      data.drafts.push({ ...sample, id: randomUUID(), month: input.month, due: input.month + '-24', source: 'paper', attachmentId });
      reopen(data, input.month);
      break;
    }
    case 'schedule_draft': {
      requireValue(validMonth(input.month), '請選擇月份。');
      const schedule = data.schedules?.find(item => item.id === input.id);
      requireValue(schedule && isExpected(schedule, input.month), '這個月份無此固定帳單。');
      requireValue(!checklist(data, input.month).find(item => item.id === input.id && (item.bill || item.draft)), '這份帳單已存在，請從清單開啟。');
      const days = new Date(Date.UTC(Number(input.month.slice(0,4)), Number(input.month.slice(5)), 0)).getUTCDate();
      data.drafts.push({ id: randomUUID(), title: schedule.title, month: input.month, due: input.month + '-' + String(Math.min(days, schedule.dueDay)).padStart(2, '0'), amount: 0,
        source: schedule.source, scheduleId: schedule.id, autoDebit: schedule.autoDebit, coveredByCard: schedule.coveredByCard });
      reopen(data, input.month);
      break;
    }
    case 'sync':
      if (!data.synced) {
        data.drafts.push({id:'card-demo',title:'台新信用卡（示範）',month,due:month+'-25',amount:1680,source:'card'});
        data.synced = true; reopen(data, month);
      }
      break;
    case 'confirm': {
      const draft = data.drafts.find(item => item.id === input.id);
      requireValue(draft, '草稿已確認或不存在。');
      requireValue(draft.source !== 'bank', '存款對帳單僅供查閱，不轉成帳單支出。');
      const fields = billFields(data, input, draft);
      data.bills.push({ ...draft, ...fields, original: original(draft) });
      data.drafts = data.drafts.filter(item => item.id !== draft.id);
      reopen(data, draft.month, fields.month);
      break;
    }
    case 'edit_bill': {
      const bill = data.bills.find(item => item.id === input.id && !item.voidedOn);
      requireValue(bill, '帳單不存在或已作廢。');
      const fields = billFields(data, input, bill);
      const oldMonth = bill.month;
      bill.original = original(bill);
      Object.assign(bill, fields);
      reopen(data, oldMonth, fields.month);
      break;
    }
    case 'void_bill':
    case 'restore_bill': {
      const bill = data.bills.find(item => item.id === input.id);
      requireValue(bill, '帳單不存在。');
      if (input.action === 'void_bill') bill.voidedOn = new Date().toISOString();
      else {
        requireValue(!bill.scheduleId || !data.bills.some(item => item.id !== bill.id && !item.voidedOn && item.month === bill.month && item.scheduleId === bill.scheduleId), '同一期已有有效帳單，請先處理重複項目。');
        delete bill.voidedOn;
      }
      reopen(data, bill.month); break;
    }
    case 'pay':
    case 'unpay': {
      const bill = data.bills.find(item => item.id === input.id && !item.voidedOn);
      requireValue(bill, '帳單不存在或已作廢。');
      if (input.action === 'unpay') delete bill.paidOn;
      else {
        requireValue(!bill.coveredByCard, '信用卡代繳請在卡費帳單確認繳款。');
        requireValue(!bill.paidOn && dateValid(input.date) && input.date <= taipeiToday(), '請填寫今天或之前的實際繳款日。');
        bill.paidOn = input.date;
      }
      break;
    }
    case 'schedule': {
      requireValue(titleValid(input.title) && validMonth(input.startMonth) && (input.endMonth === '' || input.endMonth == null || (validMonth(input.endMonth) && input.endMonth >= input.startMonth)), '請核對固定帳單名稱及起訖月份。');
      requireValue([1,2,12].includes(Number(input.interval)) && Number.isInteger(input.dueDay) && Number(input.dueDay) >= 1 && Number(input.dueDay) <= 31, '請設定週期及每期繳費日。');
      requireValue(input.source === 'paper' || input.source === 'card', '請選擇帳單類型。');
      data.schedules ??= [];
      const existing = data.schedules.find(item => item.id === input.id);
      requireValue(!input.id || existing, '固定帳單項目不存在。');
      const schedule: Schedule = { id: existing?.id ?? randomUUID(), title: input.title.trim(), source: input.source,
        startMonth: input.startMonth, endMonth: (input.endMonth || undefined) as string | undefined,
        interval: Number(input.interval) as Schedule['interval'], dueDay: Number(input.dueDay),
        autoDebit: input.autoDebit === true, coveredByCard: input.source === 'paper' && input.coveredByCard === true };
      if (existing) Object.assign(existing, schedule); else data.schedules.push(schedule);
      // A changed checklist must be reviewed again; never erase actual bills.
      data.completedMonths = {}; break;
    }
    case 'complete_month': {
      requireValue(validMonth(input.month), '月份有誤。');
      if (input.complete === true) {
        requireValue(checklist(data, input.month).every(item => item.bill), '固定帳單還沒收齊，請先補齊清單。');
        requireValue(!data.drafts.some(item => item.source !== 'bank' && item.month === input.month), '本月仍有帳單待核對。');
      }
      data.completedMonths ??= {}; data.completedMonths[input.month] = input.complete === true; break;
    }
    case 'investment': {
      requireValue(validMonth(input.month) && (input.amount === null || amountValid(input.amount)) && (input.dividends === null || amountValid(input.dividends)), '金額請填非負整數；未確認可留白。');
      data.investments ??= {}; data.investments[input.month] = { amount: input.amount as number | null, dividends: input.dividends as number | null }; break;
    }
    case 'salary': {
      requireValue(validMonth(input.month) && amountValid(input.amount), '請填寫有效月份與薪資。');
      const receipt = input.receivedOn;
      requireValue(!receipt || (dateValid(receipt) && receipt <= taipeiToday()), '請填寫今天或之前的實際入帳日。');
      const lastDay = new Date(Date.UTC(Number(input.month.slice(0,4)), Number(input.month.slice(5)), 0)).getUTCDate();
      const existing = data.entries.find(item => item.kind === 'income' && item.date.startsWith(input.month as string));
      if (existing) existing.amount = input.amount;
      else data.entries.push({id:'salary-'+input.month,date:input.month+'-'+lastDay,label:'月底薪資',amount:input.amount,kind:'income'});
      data.salaryReceipts ??= {};
      if (receipt) data.salaryReceipts[input.month] = receipt as string; else delete data.salaryReceipts[input.month];
      break;
    }
    case 'reset': save(structuredClone(seed)); return read();
    default: throw new Error('無法識別此操作。');
  }
  save(data); return data;
}
export function present(data: Snapshot): Ledger {
  const months = new Set([data.month, month, ...data.bills.map(item => item.month), ...data.drafts.map(item => item.month),
    ...Object.keys(data.investments ?? {}), ...Object.keys(data.completedMonths ?? {}),
    ...data.entries.filter(item => item.kind === 'income').map(item => item.date.slice(0,7))]);
  for (const schedule of data.schedules ?? []) {
    for (let key = schedule.startMonth; key <= month && (!schedule.endMonth || key <= schedule.endMonth); key = shiftMonth(key, schedule.interval)) months.add(key);
  }
  return { ...data, totals: Object.fromEntries([...months].map(key => [key, summarize(data, key)])) };
}
