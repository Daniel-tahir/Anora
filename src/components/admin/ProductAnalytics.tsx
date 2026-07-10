import {
  useTopSellingProducts,
  useBottomSellingProducts,
  type ProductSalesItem,
} from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface ProductTableProps {
  title: string;
  data: ProductSalesItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  variant: "top" | "bottom";
}

function ProductTable({ title, data, loading, error, onRetry, variant }: ProductTableProps) {
  return (
    <div className="border border-border/60 p-4 sm:p-6">
      <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
        {title}
      </p>

      {error && (
        <div className="border border-red/20 bg-red/5 p-6 text-center">
          <p className="text-sm text-red/80">{error}</p>
          <button
            onClick={onRetry}
            className="mt-3 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      )}

      {!loading && !error && data && data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="pb-2 pr-4 text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                  #
                </th>
                <th className="pb-2 pr-4 text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                  Product
                </th>
                <th className="pb-2 pr-4 text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-medium text-right">
                  Orders
                </th>
                <th className="pb-2 text-[10px] sm:text-[11px] tracking-[0.2em] uppercase text-muted-foreground font-medium text-right">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={item.name} className="border-b border-border/20 last:border-0">
                  <td className="py-2.5 pr-4 text-muted-foreground tabular-nums w-8">
                    {variant === "top" ? index + 1 : data.length - index}
                  </td>
                  <td className="py-2.5 pr-4 font-medium truncate max-w-[200px]">{item.name}</td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">{item.orders}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatCurrency(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ProductAnalytics() {
  const {
    data: topData,
    loading: topLoading,
    error: topError,
    refetch: topRefetch,
  } = useTopSellingProducts();

  const {
    data: bottomData,
    loading: bottomLoading,
    error: bottomError,
    refetch: bottomRefetch,
  } = useBottomSellingProducts();

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Products</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ProductTable
          title="Best Selling Products"
          data={topData}
          loading={topLoading}
          error={topError}
          onRetry={topRefetch}
          variant="top"
        />
        <ProductTable
          title="Worst Selling Products"
          data={bottomData}
          loading={bottomLoading}
          error={bottomError}
          onRetry={bottomRefetch}
          variant="bottom"
        />
      </div>
    </div>
  );
}
