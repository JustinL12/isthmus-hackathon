/** Spinning circle in the brand red, used wherever something is loading. `label` is read to screen readers. */
export function Spinner({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex ${className}`}>
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-badger/20 border-t-badger motion-reduce:animate-[spin_1.5s_linear_infinite]"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A spinner centred in the page area, for whole-page loads. */
export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner label={label} />
    </div>
  );
}
