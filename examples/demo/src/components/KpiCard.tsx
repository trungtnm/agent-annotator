import type { Kpi } from '../data';

function sparkline(series: readonly number[], width: number, height: number): string {
  const min = Math.min(...series);
  const max = Math.max(...series);
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height - ((value - min) / (max - min || 1)) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const up = kpi.delta >= 0;
  return (
    <article className="card kpi">
      <div className="kpi-top">
        <span className="kpi-label">{kpi.label}</span>
        <span className={up ? 'delta up' : 'delta down'}>
          {up ? '▲' : '▼'} {Math.abs(kpi.delta)}%
        </span>
      </div>
      <div className="kpi-value">{kpi.value}</div>
      <svg className="spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
        <path d={sparkline(kpi.series, 120, 28)} fill="none" stroke={up ? 'var(--green)' : 'var(--rose)'} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </article>
  );
}
