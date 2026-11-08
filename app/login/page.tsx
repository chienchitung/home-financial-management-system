import { redirect } from 'next/navigation';
import { authConfig } from '../../lib/auth';
import { Icon } from '../icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: '登入 · 家用帳本' };

const errors: Record<string, string> = {
  not_allowed: '這個 Google 帳號沒有使用權限，請改用已授權的帳號登入。',
  state: '登入驗證已逾時，請再試一次。',
  google: 'Google 登入沒有完成（可能已取消），請再試一次。',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const config = authConfig();
  if (config.mode === 'local') redirect('/');
  const params = await searchParams;
  const error = typeof params.error === 'string' ? params.error : undefined;
  const signedOut = params.signedOut === '1';
  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="brand"><span><Icon name="brand"/></span><div>家用帳本<small>HOUSEHOLD LEDGER</small></div></div>
      <h1 id="login-title">登入帳本</h1>
      {config.mode === 'misconfigured' ? <>
        <p className="notice error" role="alert">登入功能尚未設定完成，目前無法使用。</p>
        <p>請管理者設定以下環境變數：</p>
        <ul className="missing-env">{config.missing.map(name => <li key={name}><code>{name}</code></li>)}</ul>
      </> : <>
        <p>只有已授權的 Google 帳號可以查看與修改這本帳本。</p>
        {error && <p className="notice error" role="alert">{errors[error] ?? '登入失敗，請再試一次。'}</p>}
        {signedOut && !error && <p className="notice" role="status">已登出。</p>}
        <a className="google-button" href="/api/auth/login">
          <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          使用 Google 帳號登入
        </a>
        <small>登入只會取得你的名稱與 Email，用來確認是否有權限。</small>
      </>}
    </section>
  </main>;
}
