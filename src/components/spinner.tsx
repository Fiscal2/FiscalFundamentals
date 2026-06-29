// Centered loading spinner shared by the dashboard views.
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      role="status"
      aria-label="Loading"
    >
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
    </div>
  );
}
