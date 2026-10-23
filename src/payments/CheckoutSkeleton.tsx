export function CheckoutSkeleton() {
  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-10 animate-pulse">
      <div className="space-y-6">
        <div className="h-5 w-32 bg-neutral rounded" />
        <div className="h-8 w-64 bg-neutral rounded" />
        <div className="h-px bg-border" />
        <div className="space-y-4">
          <div className="h-4 w-24 bg-neutral rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-neutral rounded" />
            <div className="h-10 bg-neutral rounded" />
          </div>
          <div className="h-10 bg-neutral rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-neutral rounded" />
            <div className="h-10 bg-neutral rounded" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-10 bg-neutral rounded" />
            <div className="h-10 bg-neutral rounded" />
            <div className="h-10 bg-neutral rounded" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-4 w-32 bg-neutral rounded" />
          <div className="h-16 bg-neutral rounded" />
        </div>
        <div className="h-12 bg-neutral rounded" />
      </div>
      <div className="space-y-4">
        <div className="h-5 w-24 bg-neutral rounded" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-12 h-16 bg-neutral shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-neutral rounded" />
                <div className="h-3 w-20 bg-neutral rounded" />
              </div>
              <div className="h-4 w-12 bg-neutral rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
