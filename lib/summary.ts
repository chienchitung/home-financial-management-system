import type { Schedule, Snapshot, MonthlyTotal } from './model';
export const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
export const shiftMonth = (month: string, delta: number) => {
  const serial = monthNumber(month) + delta;
  return `${Math.floor(serial / 12)}-${String(((serial % 12) + 12) % 12 + 1).padStart(2, '0')}`;
};
export function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function isExpected(schedule: Schedule, month: string) {
  const elapsed = monthNumber(month) - monthNumber(schedule.startMonth);
  return elapsed >= 0 && (!schedule.endMonth || month <= schedule.endMonth) && elapsed % schedule.interval === 0;
}
export function checklist(data: Snapshot, month: string) {
  return (data.schedules ?? []).filter(schedule => isExpected(schedule, month)).map(schedule => ({
    ...schedule,
    bill: data.bills.find(bill => !bill.voidedOn && bill.scheduleId === schedule.id && bill.month === month),
    draft: data.drafts.find(draft => draft.scheduleId === schedule.id && draft.month === month),
  }));
}
export function summarize(data: Snapshot, month: string): MonthlyTotal {
  const bills = data.bills.filter(bill => !bill.voidedOn && bill.month === month && bill.source !== 'bank');
  const salary = data.entries.find(entry => entry.kind === 'income' && entry.date.startsWith(month))?.amount ?? data.salary;
  const investment = data.investments?.[month]?.amount ?? null;
  const dividends = data.investments?.[month]?.dividends ?? null;
  const billsComplete = !!data.completedMonths?.[month] && checklist(data, month).every(item => item.bill)
    && !data.drafts.some(draft => draft.source !== 'bank' && draft.month === month);
  const expenses = bills.filter(bill => !bill.coveredByCard).reduce((sum, bill) => sum + bill.amount, 0);
  const income = salary + (dividends ?? 0);
  return { income, expenses, investment, dividends, salary, billsComplete, hasBills: bills.length > 0,
    salaryReceived: !!data.salaryReceipts?.[month],
    balance: billsComplete && investment !== null && dividends !== null ? income - expenses - investment : null };
}
export const money = (amount: number) => 'NT$ ' + new Intl.NumberFormat('zh-TW').format(amount);
