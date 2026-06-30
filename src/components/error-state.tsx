// Shown when a data fetch fails, so an outage/network error is visually
// distinct from a legitimately empty result (which would otherwise look the
// same to the user). Optionally offers a retry.
export function ErrorState({
  message,
  onRetry,
  className = '',
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 text-center ${className}`} role="alert">
      <p className="text-gray-500">
        {message ?? "Something went wrong loading this data."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md border px-4 py-1.5 text-sm transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
