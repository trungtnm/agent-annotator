import { REVENUE } from '../data';

const WIDTH = 640;
const HEIGHT = 200;

export function RevenueChart() {
  const max = Math.max(...REVENUE) * 1.15;
  const points = REVENUE.map((value, index) => [
    (index / (REVENUE.length - 1)) * WIDTH,
    HEIGHT - (value / max) * HEIGHT,
  ]);
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
  const [lastX, lastY] = points[points.length - 1]!;

  return (
    <article className="card chart">
      <div className="card-head">
        <div>
          <h2>Revenue</h2>
          <p className="muted">Last 14 days</p>
        </div>
        <div className="segmented" role="tablist">
          <button type="button" className="on">14d</button>
          <button type="button">30d</button>
          <button type="button">90d</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" aria-label="Revenue over the last 14 days">
        <defs>
          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((row) => (
          <line key={row} x1="0" x2={WIDTH} y1={HEIGHT * row} y2={HEIGHT * row} className="gridline" />
        ))}
        <path d={area} fill="url(#fill)" />
        <path d={line} fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r="6" fill="#fff" stroke="var(--violet)" strokeWidth="3" />
      </svg>
    </article>
  );
}
