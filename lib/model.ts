export type Entry = { id: string; date: string; label: string; amount: number; kind: 'income' | 'expense' | 'reconciliation' };
export type BillSource = 'paper' | 'card' | 'bank';
export type Original = { title: string; month: string; due: string; amount: number };
export type Draft = Original & {
  id: string; source: BillSource; coveredByCard?: boolean; autoDebit?: boolean;
  scheduleId?: string; attachmentId?: string; original?: Original; rows?: Entry[];
};
export type Bill = Draft & { paidOn?: string; voidedOn?: string };
export type Schedule = {
  id: string; title: string; source: 'paper' | 'card'; startMonth: string; endMonth?: string;
  interval: 1 | 2 | 12; dueDay: number; autoDebit: boolean; coveredByCard: boolean;
};
export type Snapshot = {
  month: string; drafts: Draft[]; bills: Bill[]; entries: Entry[]; salary: number; synced: boolean;
  investments?: Record<string, { amount: number | null; dividends: number | null }>;
  schedules?: Schedule[]; completedMonths?: Record<string, boolean>;
  salaryReceipts?: Record<string, string>;
};
export type MonthlyTotal = {
  income: number; expenses: number; investment: number | null; dividends: number | null; salary: number;
  salaryReceived: boolean; billsComplete: boolean; hasBills: boolean; balance: number | null;
};
export type Ledger = Snapshot & { totals: Record<string, MonthlyTotal> };
export type SendAction = (action: string, fields: Record<string, unknown>, message: string) => Promise<Ledger | undefined>;
export const paperSamples = [
  { title: '中華電信', amount: 699 }, { title: '臺北自來水', amount: 220 }, { title: '台灣電力', amount: 243 },
];
