import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Snapshot } from './model';
import { SCHEMA_SQL } from './db-schema';
import { attachment as fileAttachment, attachmentError, attachmentTypes, checkAttachment, saveAttachment as saveFileAttachment } from './attachments';
import { apply, LedgerError, mutate as mutateFile, present, read as readFile } from './store';
import { taipeiToday } from './summary';

/**
 * Storage selection:
 * - "postgres": DATABASE_URL is set (Neon in production, any Postgres locally).
 * - "file": local JSON under DEMO_DATA_DIR / .demo-data (local demo only).
 * - "unavailable": on Vercel without DATABASE_URL; local files are not durable there.
 */
export type StorageMode = 'postgres' | 'file' | 'unavailable';
export function storageMode(env: Record<string, string | undefined> = process.env): StorageMode {
  if (env.DATABASE_URL?.trim()) return 'postgres';
  return env.VERCEL ? 'unavailable' : 'file';
}
export class StorageUnavailable extends Error { constructor() { super('尚未設定資料庫，暫時無法讀取帳本。'); } }

const ledgerId = () => process.env.LEDGER_ID?.trim() || 'household';
/** Destructive demo reset is always allowed on local files, but only by explicit opt-in on a database. */
export const resetAllowed = () => storageMode() === 'file' || process.env.LEDGER_ALLOW_RESET === '1';

/** A real household starts empty; the default salary is private configuration, never in source. */
export function emptyLedger(env: Record<string, string | undefined> = process.env): Snapshot {
  const salary = Number(env.LEDGER_DEFAULT_SALARY ?? 0);
  return { month: taipeiToday().slice(0, 7), salary: Number.isSafeInteger(salary) && salary >= 0 ? salary : 0,
    synced: false, drafts: [], bills: [], entries: [], schedules: [] };
}

/** When LEDGER_DEFAULT_SALARY is set it is authoritative, so it can be configured after the ledger exists. */
function withConfiguredSalary(data: Snapshot) {
  const configured = process.env.LEDGER_DEFAULT_SALARY?.trim();
  const salary = Number(configured);
  return configured && Number.isSafeInteger(salary) && salary >= 0 ? { ...data, salary } : data;
}

const globalForDb = globalThis as unknown as { ledgerPool?: Pool; ledgerSchema?: Promise<void> };
function pool() {
  globalForDb.ledgerPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 });
  return globalForDb.ledgerPool;
}
async function ready() {
  globalForDb.ledgerSchema ??= (async () => {
    const client = await pool().connect();
    try {
      // Serialise first-time setup across concurrent cold starts. A transaction-scoped lock is required:
      // Neon's pooler (transaction mode) may run separate statements on different server connections,
      // so a session lock could be taken on one and never released.
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['ledger-schema']);
        await client.query(SCHEMA_SQL);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    } finally { client.release(); }
  })().catch(error => { globalForDb.ledgerSchema = undefined; throw error; });
  return globalForDb.ledgerSchema;
}
async function ensureLedger(id: string) {
  await pool().query('INSERT INTO ledgers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, JSON.stringify(emptyLedger())]);
}

export async function loadLedger() {
  const mode = storageMode();
  if (mode === 'unavailable') throw new StorageUnavailable();
  if (mode === 'file') return present(readFile());
  await ready(); const id = ledgerId(); await ensureLedger(id);
  const { rows } = await pool().query<{ data: Snapshot }>('SELECT data FROM ledgers WHERE id = $1', [id]);
  return present(withConfiguredSalary(rows[0].data));
}

export async function runAction(input: Record<string, unknown>, actor?: string) {
  const mode = storageMode();
  if (mode === 'unavailable') throw new StorageUnavailable();
  if (input.action === 'reset' && !resetAllowed()) throw new LedgerError('正式帳本不能重設。');
  if (mode === 'file') return present(mutateFile(input));
  await ready(); const id = ledgerId(); await ensureLedger(id);
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ data: Snapshot; version: number }>('SELECT data, version FROM ledgers WHERE id = $1 FOR UPDATE', [id]);
    let known = false;
    if (input.action === 'paper' && typeof input.attachmentId === 'string' && /^[a-f0-9-]{36}$/.test(input.attachmentId)) {
      known = (await client.query('SELECT 1 FROM attachments WHERE id = $1 AND ledger_id = $2', [input.attachmentId, id])).rowCount === 1;
    }
    const data = apply(withConfiguredSalary(rows[0].data), input, { attachmentExists: () => known });
    const version = rows[0].version + 1;
    await client.query('UPDATE ledgers SET data = $2, version = $3, updated_at = now(), updated_by = $4 WHERE id = $1', [id, JSON.stringify(data), version, actor ?? null]);
    await client.query('INSERT INTO ledger_events (ledger_id, action, actor, version) VALUES ($1, $2, $3, $4)', [id, String(input.action), actor ?? null, version]);
    await client.query('COMMIT');
    return present(data);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function storeAttachment(file: File) {
  const mode = storageMode();
  if (mode === 'unavailable') throw new StorageUnavailable();
  if (mode === 'file') return saveFileAttachment(file);
  checkAttachment(file);
  await ready(); const id = ledgerId(); await ensureLedger(id);
  const attachmentId = randomUUID();
  await pool().query('INSERT INTO attachments (id, ledger_id, name, type, bytes) VALUES ($1, $2, $3, $4, $5)',
    [attachmentId, id, file.name.slice(0, 255), file.type, Buffer.from(await file.arrayBuffer())]);
  return attachmentId;
}

export async function loadAttachment(attachmentId: string): Promise<{ name: string; type: string; bytes: Buffer }> {
  const mode = storageMode();
  if (mode === 'unavailable') throw new StorageUnavailable();
  if (mode === 'file') return fileAttachment(attachmentId);
  if (!/^[a-f0-9-]{36}$/.test(attachmentId)) throw attachmentError();
  await ready();
  const { rows } = await pool().query<{ name: string; type: string; bytes: Buffer }>(
    'SELECT name, type, bytes FROM attachments WHERE id = $1 AND ledger_id = $2', [attachmentId, ledgerId()]);
  if (!rows[0] || !attachmentTypes.includes(rows[0].type)) throw attachmentError();
  return rows[0];
}

/** Maps an error to an HTTP response: fixable input → 400, missing storage → 503, anything else → 500 (logged). */
export function errorResponse(error: unknown, context: string, fallback = '儲存失敗，請稍後再試；輸入內容仍保留。') {
  if (error instanceof LedgerError) return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
  console.error(context, error);
  return Response.json({ error: fallback }, { status: 500 });
}
