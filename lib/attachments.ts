import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { directory, LedgerError } from './store';
const types = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const attachmentTypes = types;
export const attachmentError = () => new Error('找不到原檔');
export function checkAttachment(file: File) {
  if (!types.includes(file.type) || file.size === 0 || file.size > 8 * 1024 * 1024) throw new LedgerError('請選擇 8 MB 以下的 JPEG、PNG、WebP 或 HEIC 照片。');
}
export async function saveAttachment(file: File) {
  checkAttachment(file);
  const id = randomUUID(); const folder = join(directory, 'attachments');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(join(folder, id), Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  writeFileSync(join(folder, id + '.json'), JSON.stringify({ name: file.name, type: file.type }), { mode: 0o600 });
  return id;
}
export function attachment(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('找不到原檔');
  const meta = JSON.parse(readFileSync(join(directory, 'attachments', id + '.json'), 'utf8'));
  if (!types.includes(meta.type)) throw new Error('檔案格式不符');
  return { ...meta, bytes: readFileSync(join(directory, 'attachments', id)) };
}
