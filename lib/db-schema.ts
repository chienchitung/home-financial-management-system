// Postgres (Neon) schema. Kept free of imports so scripts/db-import.ts can load it directly with Node.
// The whole ledger is one JSONB document per household so every business rule in lib/store.ts applies
// unchanged; each change runs in a transaction with a row lock, and is recorded in ledger_events.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ledgers (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
CREATE TABLE IF NOT EXISTS ledger_events (
  id bigserial PRIMARY KEY,
  ledger_id text NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor text,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_events_ledger_idx ON ledger_events (ledger_id, created_at DESC);
CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  ledger_id text NOT NULL REFERENCES ledgers(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_ledger_idx ON attachments (ledger_id);
`;
