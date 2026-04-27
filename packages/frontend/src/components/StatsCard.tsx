interface StatsCardProps {
  label: string;
  value: number;
  format?: 'number' | 'compact';
}

export default function StatsCard({ label, value, format = 'compact' }: StatsCardProps) {
  const display = format === 'compact' ? formatCompact(value) : String(value);

  return (
    <div className="rounded-lg border border-default bg-surface px-4 py-3">
      <div className="font-mono text-2xl font-bold text-fg">{display}</div>
      <div className="mt-0.5 text-xs text-fg-secondary">{label}</div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
