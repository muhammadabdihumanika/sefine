/**
 * Streaming fallback for the whole (app) route group.
 * The MobileShell (top bar + bottom nav) is rendered by the layout and stays
 * mounted across navigations; this skeleton streams into the content area
 * instantly while the page's data resolves — so switching pages feels snappy
 * instead of freezing on the previous screen.
 */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      {/* Title + leading figure */}
      <div className="space-y-2">
        <div className="h-3 w-28 rounded-full bg-muted animate-pulse" />
        <div className="h-8 w-44 rounded-lg bg-muted animate-pulse" />
        <div className="h-3 w-32 rounded-full bg-muted/70 animate-pulse" />
      </div>

      {/* Two stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-subtle h-20 rounded-2xl animate-pulse" />
        <div className="glass-subtle h-20 rounded-2xl animate-pulse" />
      </div>

      {/* A wide card */}
      <div className="glass h-28 rounded-2xl animate-pulse" />

      {/* A list of rows */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="glass-subtle flex items-center gap-3 rounded-2xl p-3 animate-pulse"
          >
            <div className="size-10 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 rounded-full bg-muted" />
              <div className="h-2.5 w-1/3 rounded-full bg-muted/70" />
            </div>
            <div className="h-3 w-16 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
