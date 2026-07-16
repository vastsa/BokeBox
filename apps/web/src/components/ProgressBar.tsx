export function ProgressBar({
  value,
  tone = 'brand',
}: {
  value: number;
  tone?: 'brand' | 'danger';
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`pb-progress ${tone === 'danger' ? 'is-danger' : ''}`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
