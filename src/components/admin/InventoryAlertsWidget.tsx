import { useInventoryAlerts, resolveAlert } from "@/lib/admin-inventory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const alertColors: Record<string, string> = {
  critical: "destructive",
  low: "secondary",
  overstock: "default",
};

export function InventoryAlertsWidget() {
  const { alerts, loading, error, refetch } = useInventoryAlerts(true);

  async function handleResolve(alertId: string) {
    await resolveAlert(alertId);
    refetch();
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading alerts...</div>;
  if (error) return <div className="text-sm text-red-500">{error}</div>;

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Inventory Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No alerts to show</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Inventory Alerts ({alerts.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-center justify-between rounded-md border p-3">
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  (alertColors[alert.alert_type] as
                    | "destructive"
                    | "secondary"
                    | "default"
                    | "outline") ?? "outline"
                }
              >
                {alert.alert_type}
              </Badge>
              <div>
                <p className="font-medium text-sm">{alert.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  SKU: {alert.product_sku ?? "—"} &middot; Stock: {alert.current_stock} &middot;
                  Threshold: {alert.threshold}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleResolve(alert.id)}>
              Resolve
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
