import { formatPaise } from "@/lib/money";
import type { DashboardStats } from "@/server/services/admin-dashboard";

export function RevenueBars({ days }: { days: DashboardStats["revenueByDay"] }) {
  const max = Math.max(1, ...days.map((d) => d.revenuePaise));
  const total = days.reduce((s, d) => s + d.revenuePaise, 0);
  const W = 14 * 20;
  const H = 120;
  return (
    <figure className="space-y-2" data-testid="revenue-bars">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="h-40 w-full" role="img" aria-label={`Revenue over the last 14 days: ${formatPaise(total)} in total`}>
        {days.map((d, i) => {
          const h = Math.round((d.revenuePaise / max) * H);
          return (
            <g key={d.date}>
              <rect x={i * 20 + 3} y={H - h} width={14} height={Math.max(h, 1)} rx={2} className={i === days.length - 1 ? "fill-brand" : "fill-text-muted/60"}>
                <title>{`${d.date}: ${formatPaise(d.revenuePaise)} (${d.orders} orders)`}</title>
              </rect>
            </g>
          );
        })}
        <text x={0} y={H + 14} className="fill-text-muted text-[9px]">{days[0]?.date.slice(5)}</text>
        <text x={W} y={H + 14} textAnchor="end" className="fill-text-muted text-[9px]">Today</text>
      </svg>
      <table className="sr-only">
        <caption>Revenue by day</caption>
        <tbody>{days.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{formatPaise(d.revenuePaise)}</td><td>{d.orders} orders</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
