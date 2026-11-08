import { useEffect, useId, useRef, useState } from 'react';
import type { MonthlyTotal } from '../lib/model';
import { shiftMonth } from '../lib/summary';

type Totals = Record<string, MonthlyTotal>;
type TrendProps = { month: string; totals: Totals; onMonth: (month: string) => void };
const format = new Intl.NumberFormat('zh-TW');
const dollars = (value: number) => 'NT$ ' + format.format(value);
const left = 64;
const top = 28;
const bottom = 238;

export function MonthlyTrend({ month, totals, onMonth }: TrendProps) {
  const [expenseOnly, setExpenseOnly] = useState(false);
  const [range, setRange] = useState<6 | 12>(6);
  const [rangeEnd, setRangeEnd] = useState(month);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const element = plot.current; if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (month < shiftMonth(rangeEnd, -5) || month > rangeEnd) setRangeEnd(month); }, [month, rangeEnd]);
  const scroll = useRef<HTMLDivElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const year = month.slice(0, 4);
  const months = range === 6 ? Array.from({ length: 6 }, (_, index) => shiftMonth(rangeEnd, index - 5))
    : Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
  const column = (width - left - 20) / months.length;
  const known = (key: string, kind: 'income' | 'expenses' | 'investment') => !!totals[key] && (kind === 'expenses' ? totals[key].hasBills || totals[key].billsComplete : kind === 'investment' ? totals[key].investment !== null : true);
  const valueText = (key: string, kind: 'income' | 'expenses' | 'investment') => known(key, kind) ? dollars(totals[key][kind]!) : kind === 'investment' ? '待填寫' : '資料未齊';
  const selected = totals[month];
  const series = expenseOnly ? ['expenses'] as const : ['income', 'expenses', 'investment'] as const;
  const max = Math.max(0, ...months.flatMap(key => series.map(kind => totals[key]?.[kind] ?? 0)));
  const magnitude = 10 ** Math.floor(Math.log10(max / 4 || 250));
  const step = Math.ceil((max / 4 || 250) / magnitude) * magnitude;
  const ceiling = step * 4;
  const x = (index: number) => left + column * (index + .5);
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  const hasData = months.some(key => totals[key]);

  // Keep the selected month visible on narrow screens without moving the page.
  useEffect(() => {
    const container = scroll.current;
    const button = selectedButton.current;
    if (!container || !button) return;
    const containerBounds = container.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < containerBounds.left || buttonBounds.right > containerBounds.right) {
      container.scrollLeft += buttonBounds.left - containerBounds.left - (container.clientWidth - buttonBounds.width) / 2;
    }
  }, [month, range, rangeEnd, width]);

  return <section className="panel trend-panel" aria-labelledby={`${id}-title`}>
    <div className="trend-heading">
      <div><h2 id={`${id}-title`}>{range === 6 ? `${months[0]} 至 ${months[5]}` : `${year} 年`} 收支趨勢</h2><p>點選月份查看金額。</p></div>
      <div className="chart-controls"><div className="chart-modes" role="group" aria-label="趨勢圖期間"><button type="button" aria-pressed={range===6} onClick={()=>{setRange(6);setRangeEnd(month);}}>近半年</button><button type="button" aria-pressed={range===12} onClick={()=>setRange(12)}>全年</button></div><div className="chart-modes" role="group" aria-label="趨勢圖顯示內容">
        <button type="button" aria-pressed={!expenseOnly} onClick={() => setExpenseOnly(false)}>收支比較</button>
        <button type="button" aria-pressed={expenseOnly} onClick={() => setExpenseOnly(true)}>只看支出</button>
      </div></div>
    </div>
    <div className="trend-toolbar">
      <span>金額（NT$）</span>
      <div className="trend-legend" aria-label="圖例">
        {!expenseOnly && <><span><i className="legend-income" aria-hidden="true"/>收入</span><span><i className="legend-investment" aria-hidden="true"/>股票投入</span></>}
        <span><i className="legend-expense" aria-hidden="true"/>支出</span>
        <span className="legend-missing">— 尚無紀錄</span>
      </div>
    </div>
    <div className="trend-scroll" ref={scroll}>
      <div ref={plot} className={range === 6 ? "monthly-chart six-months" : "monthly-chart"}>
        <svg className="trend-plot" viewBox={`0 0 ${width} 288`} role="img" aria-labelledby={`${id}-chart-title ${id}-description`}>
          <title id={`${id}-chart-title`}>{year} 年{expenseOnly ? '每月支出' : '收入、帳單與股票投入'}折線圖</title>
          <desc id={`${id}-description`}>橫軸為月份，縱軸為新臺幣金額，從零開始。空白月份尚無紀錄，折線不跨越空白月份。精確數字可點選月份或展開下方每月數字查看。</desc>
          <rect x={left + column * Math.max(0, months.indexOf(month))} y={top - 8} width={column} height={bottom - top + 16} rx="8" fill="#edf5f0"/>
          {[0, 1, 2, 3, 4].map(index => <g key={index}>
            <line x1={left} y1={y(step * index)} x2={width - 20} y2={y(step * index)} stroke={index ? '#e5ece7' : '#b6c8bd'} strokeDasharray={index ? '3 5' : undefined}/>
          </g>)}
          {series.map(kind => {
            const color = kind === 'income' ? '#267456' : kind === 'investment' ? '#426ba0' : '#a15b32';
            const path = months.map((key, index) => known(key, kind)
              ? `${index > 0 && known(months[index - 1], kind) ? 'L' : 'M'} ${x(index)} ${y(totals[key][kind])}` : '').join(' ');
            return <g key={kind}>
              <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={kind === 'expenses' ? '6 4' : undefined} strokeLinejoin="round"/>
              {months.map((key, index) => known(key, kind) && (kind === 'income'
                ? <circle key={key} cx={x(index)} cy={y(totals[key][kind])} r="4.5" fill="white" stroke={color} strokeWidth="2.5"/>
                : <rect key={key} x={x(index) - 4} y={y(totals[key][kind]) - 4} width="8" height="8" rx="1" fill={color}/>))}
            </g>;
          })}
          {months.map((key, index) => !totals[key] && <text key={key} x={x(index)} y={bottom - 12} textAnchor="middle" className="missing-marker">—</text>)}
          {!hasData && <text x={width / 2} y="130" textAnchor="middle" className="axis-label">這一年尚無收支紀錄</text>}
        </svg>
        <div className="trend-months" style={{gridTemplateColumns:`repeat(${months.length}, minmax(0, 1fr))`}} role="group" aria-label="月份，點選後更新當月收支">
          {months.map((key, index) => <button key={key} type="button" ref={key === month ? selectedButton : undefined}
            aria-pressed={key === month} onClick={() => onMonth(key)}
            aria-label={`${key}，收入 ${valueText(key, 'income')}，支出 ${valueText(key, 'expenses')}，股票投入 ${valueText(key, 'investment')}`}>
            <span>{Number(key.slice(5))} 月</span>
          </button>)}
        </div>
        <svg className="trend-axis" viewBox="0 0 64 288" aria-hidden="true">
          <rect width="64" height="288" fill="white"/>
          {[0, 1, 2, 3, 4].map(index => <text key={index} x={left - 12} y={y(step * index) + 4} textAnchor="end" className="axis-label">{format.format(step * index)}</text>)}
        </svg>
      </div>
    </div>
    {range===12&&<p className="chart-scroll-hint">左右滑動可查看其他月份。</p>}
    <div className="trend-selected" role="status" aria-live="polite">
      <b>{year} 年 {Number(month.slice(5))} 月</b>
      {selected ? <dl>
        <div><dt>收入</dt><dd>{dollars(selected.income)}</dd></div>
        <div><dt>支出</dt><dd>{valueText(month, 'expenses')}{!selected.billsComplete && selected.hasBills ? '（未收齊）' : ''}</dd></div>
        <div><dt>股票投入</dt><dd>{valueText(month, 'investment')}</dd></div><div><dt>本月預計剩餘</dt><dd>{selected.balance === null ? '資料未齊' : dollars(selected.balance)}</dd></div>
      </dl> : <span>尚無紀錄。</span>}
    </div>
    <p className="chart-note">未填寫的金額不畫線；帳單未收齊時，支出只含已收到的部分。</p>
    <details className="trend-table"><summary>查看每月數字</summary>
      <div className="table-scroll"><table>
        <caption>{months[0]} 至 {months[months.length - 1]}，金額單位：新臺幣</caption>
        <thead><tr><th scope="col">月份</th><th scope="col">收入</th><th scope="col">支出</th><th scope="col">股票投入</th><th scope="col">本月預計剩餘</th></tr></thead>
        <tbody>{months.map(key => <tr key={key} aria-current={key === month ? 'date' : undefined}>
          <th scope="row"><button type="button" onClick={() => onMonth(key)} aria-label={`查看 ${key} 明細`}>{key}</button></th>
          {totals[key] ? <><td>{format.format(totals[key].income)}</td><td>{valueText(key, 'expenses')}{!totals[key].billsComplete ? '（未收齊）' : ''}</td><td>{valueText(key, 'investment')}</td><td>{totals[key].balance === null ? '資料未齊' : format.format(totals[key].balance)}</td></>
            : <td colSpan={4} className="no-record">尚無紀錄</td>}
        </tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}
