import type { ReactNode } from 'react';

const artwork = {
  brand: <><path d="m3 10 9-7 9 7M5 9v11h14V9"/><path d="M9 13h6m-6 3h4"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/></>,
  inbox: <><path d="M12 3v10m-4-4 4 4 4-4M6 8H4l-2 7v5h20v-5l-2-7h-2"/><path d="M2 15h6l2 2h4l2-2h6"/></>,
  report: <><path d="M5 3h10l4 4v14H5zM15 3v5h4M8 17v-3m4 3v-6m4 6v-4"/></>,
  income: <><path d="M5 5v14h14M9 10l4 4 6-7m-4 0h4v4"/></>,
  expense: <><path d="M5 5v14h14M9 8l4 4 6 2m-4 0h4v-4"/></>,
  balance: <><path d="M4 7h16M12 4v16m-5 0h10M7 7l-3 7h6zm10 0-3 7h6z"/></>,
  paper: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h4"/></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
  bank: <><path d="m3 9 9-6 9 6H3zm2 11h14M7 12v5m5-5v5m5-5v5"/></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3"/></>,
  sync: <><path d="M20 9a8 8 0 0 0-14-3L3 9m0-5v5h5m-4 6a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
  check: <path d="m5 12 5 5L19 7"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  reset: <><path d="M3 11a9 9 0 1 1 3 7M3 5v6h6"/></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof artwork;

export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
    {artwork[name]}
  </svg>;
}
