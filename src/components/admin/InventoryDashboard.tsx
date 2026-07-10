import { useInventorySummary } from "@/lib/admin-inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function InventoryDashboard() {
  const { summary, loading, error } = useInventorySummary();

  if (loading) return <div className="text-sm text-muted-foreground">Loading summary...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;
  if (!summary) return null;

  const cards = [
    { title: "Total Products", value: summary.totalProducts },
    { title: "In Stock", value: summary.inStock, className: "text-green-600" },
    { title: "Low Stock", value: summary.lowStock, className: "text-amber-600" },
    { title: "Out of Stock", value: summary.outOfStock, className: "text-red-600" },
    { title: "Overstock", value: summary.overstock, className: "text-blue-600" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${card.className ?? ""}`}>{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
