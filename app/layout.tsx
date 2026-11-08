import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = { title: '家用帳本 · 本機 Demo', description: '家庭收支管理系統操作預覽' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
