export function TaxiBadge({ className }: { className?: string }) {
  return (
    <span className={`badge taxi ${className ?? ''}`.trim()} data-testid="taxi-badge">
      แท็กซี่
    </span>
  );
}
