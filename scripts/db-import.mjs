// Copies the local demo ledger (ledger.json + attachments) into Postgres/Neon.
// Usage: DATABASE_URL=... npm run db:import [-- --force]
// Without --force it refuses to overwrite a ledger that already has changes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { SCHEMA_SQL } from '../lib/db-schema.ts';

const url = process.env.DATABASE_URL;
if (!url) { console.error('請先設定 DATABASE_URL。'); process.exit(1); }
const force = process.argv.includes('--force');
const directory = process.env.DEMO_DATA_DIR || join(process.cwd(), '.demo-data');
const ledgerId = process.env.LEDGER_ID?.trim() || 'household';
const source = join(directory, 'ledger.json');
if (!existsSync(source)) { console.error(`找不到 ${source}。`); process.exit(1); }
const data = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(data.bills) || !Array.isArray(data.drafts)) { console.error('ledger.json 格式不符。'); process.exit(1); }

const types = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const folder = join(directory, 'attachments');
const attachments = existsSync(folder) ? readdirSync(folder).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).flatMap(name => {
  const id = name.slice(0, -5); const meta = JSON.parse(readFileSync(join(folder, name), 'utf8'));
  if (!types.includes(meta.type) || !existsSync(join(folder, id))) return [];
  return [{ id, name: String(meta.name).slice(0, 255), type: meta.type, bytes: readFileSync(join(folder, id)) }];
}) : [];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(SCHEMA_SQL);
  await client.query('BEGIN');
  const existing = await client.query('SELECT version FROM ledgers WHERE id = $1 FOR UPDATE', [ledgerId]);
  if (existing.rowCount && existing.rows[0].version > 1 && !force) {
    throw new Error(`雲端帳本「${ledgerId}」已有 ${existing.rows[0].version - 1} 次修改，未覆寫。確定要以本機資料取代時請加 --force。`);
  }
  await client.query(`INSERT INTO ledgers (id, data, version, updated_by) VALUES ($1, $2, 2, 'import')
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = ledgers.version + 1, updated_at = now(), updated_by = 'import'`, [ledgerId, JSON.stringify(data)]);
  const { rows } = await client.query('SELECT version FROM ledgers WHERE id = $1', [ledgerId]);
  await client.query('INSERT INTO ledger_events (ledger_id, action, actor, version) VALUES ($1, $2, $3, $4)', [ledgerId, 'import', 'import', rows[0].version]);
  for (const file of attachments) {
    await client.query('INSERT INTO attachments (id, ledger_id, name, type, bytes) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [file.id, ledgerId, file.name, file.type, file.bytes]);
  }
  await client.query('COMMIT');
  console.log(`已匯入帳本「${ledgerId}」：${data.bills.length} 份帳單、${data.drafts.length} 份草稿、${attachments.length} 張照片。`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally { await client.end(); }
