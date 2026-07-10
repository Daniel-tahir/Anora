import { useState } from "react";
import {
  useRevenueReport,
  useFinancialReport,
  useCustomerReport,
  useInventoryReport,
} from "@/lib/admin-reports";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/admin-export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { Download, TrendingUp, Users, Package, DollarSign } from "lucide-react";

export function ReportsDashboard() {
  const [activeTab, setActiveTab] = useState<"sales" | "finance" | "customers" | "inventory">(
    "sales",
  );
  const [dateRange, setDateRange] = useState("30days");
  const startDate =
    dateRange === "30days"
      ? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
      : dateRange === "90days"
        ? new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]
        : dateRange === "1year"
          ? new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
          : undefined;
  const endDate = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Reports</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Sales, financial, customer, and inventory reports with export support.
        </p>
      </div>

      <div className="flex gap-2 mb-8">
        {(["sales", "finance", "customers", "inventory"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-[11px] tracking-[0.2em] uppercase rounded-md transition-colors ${
              activeTab === tab
                ? "bg-foreground text-background"
                : "border border-border/60 text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {tab === "sales"
              ? "Sales"
              : tab === "finance"
                ? "Finance"
                : tab === "customers"
                  ? "Customers"
                  : "Inventory"}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-8">
        {["30days", "90days", "1year"].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase rounded-md transition-colors ${
              dateRange === r
                ? "bg-foreground text-background"
                : "border border-border/60 text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {r === "30days" ? "30 Days" : r === "90days" ? "90 Days" : "1 Year"}
          </button>
        ))}
      </div>

      {activeTab === "sales" && <SalesReports startDate={startDate} endDate={endDate} />}
      {activeTab === "finance" && <FinanceReports startDate={startDate} endDate={endDate} />}
      {activeTab === "customers" && <CustomerReports startDate={startDate} endDate={endDate} />}
      {activeTab === "inventory" && <InventoryReports />}
    </div>
  );
}

function SalesReports({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, loading } = useRevenueReport(startDate, endDate);

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (!data)
    return <div className="text-sm text-muted-foreground py-12 text-center">No data available</div>;

  const dailyData = (data.daily || []).map((d: any) => ({
    ...d,
    date: d.date?.slice(5, 10),
  }));

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <DashboardCard
          label="Gross Revenue"
          value={`$${Number(data.totalGrossRevenue).toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          label="Net Revenue"
          value={`$${Number(data.totalNetRevenue).toLocaleString()}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <DashboardCard
          label="Taxes"
          value={`$${Number(data.totalTaxes).toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          label="Discounts"
          value={`$${Number(data.totalDiscounts).toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          label="Orders"
          value={data.totalOrders.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <div className="border border-border/60 p-6 mb-6">
        <h3 className="text-sm font-medium mb-4">Daily Revenue</h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip />
              <Legend />
              <Bar dataKey="grossRevenue" fill="hsl(var(--foreground))" name="Gross Revenue" />
              <Bar dataKey="netRevenue" fill="hsl(var(--gold))" name="Net Revenue" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            No sales data
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const rows = (data.daily || []).map((d: any) => [
              d.date,
              d.grossRevenue,
              d.netRevenue,
              d.taxes,
              d.discounts,
              d.orders,
            ]);
            exportPDF(
              "Sales Report",
              ["Date", "Gross Revenue", "Net Revenue", "Taxes", "Discounts", "Orders"],
              rows,
              `sales-report-${endDate}`,
            );
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvData = (data.daily || []).map((d: any) => ({
              Date: d.date,
              "Gross Revenue": d.grossRevenue,
              "Net Revenue": d.netRevenue,
              Taxes: d.taxes,
              Discounts: d.discounts,
              Orders: d.orders,
            }));
            exportCSV(csvData, `sales-report-${endDate}`);
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const excelData = (data.daily || []).map((d: any) => ({
              Date: d.date,
              GrossRevenue: d.grossRevenue,
              NetRevenue: d.netRevenue,
              Taxes: d.taxes,
              Discounts: d.discounts,
              Orders: d.orders,
            }));
            exportExcel(excelData, `sales-report-${endDate}`, "Sales");
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
        </Button>
      </div>
    </div>
  );
}

function FinanceReports({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, loading } = useFinancialReport(startDate, endDate);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data)
    return <div className="text-sm text-muted-foreground py-12 text-center">No data available</div>;

  const dailyData = (data.daily || []).map((d: any) => ({
    ...d,
    date: d.date?.slice(5, 10),
  }));

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <DashboardCard label="Total Taxes" value={`$${Number(data.totalTaxes).toLocaleString()}`} />
        <DashboardCard
          label="Total Discounts"
          value={`$${Number(data.totalDiscounts).toLocaleString()}`}
        />
        <DashboardCard
          label="Total Refunds"
          value={`$${Number(data.totalRefunds).toLocaleString()}`}
        />
      </div>

      <div className="border border-border/60 p-6 mb-6">
        <h3 className="text-sm font-medium mb-4">Daily Financial Breakdown</h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="taxes"
                stroke="hsl(var(--foreground))"
                fill="hsl(var(--foreground))"
                fillOpacity={0.1}
                name="Taxes"
              />
              <Area
                type="monotone"
                dataKey="discounts"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.1}
                name="Discounts"
              />
              <Area
                type="monotone"
                dataKey="refunds"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.1}
                name="Refunds"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
            No financial data
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const rows = (data.daily || []).map((d: any) => [
              d.date,
              d.taxes,
              d.discounts,
              d.refunds,
            ]);
            exportPDF(
              "Financial Report",
              ["Date", "Taxes", "Discounts", "Refunds"],
              rows,
              `finance-report-${endDate}`,
            );
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const csvData = (data.daily || []).map((d: any) => ({
              Date: d.date,
              Taxes: d.taxes,
              Discounts: d.discounts,
              Refunds: d.refunds,
            }));
            exportCSV(csvData, `finance-report-${endDate}`);
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const excelData = (data.daily || []).map((d: any) => ({
              Date: d.date,
              Taxes: d.taxes,
              Discounts: d.discounts,
              Refunds: d.refunds,
            }));
            exportExcel(excelData, `finance-report-${endDate}`, "Finance");
          }}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
        </Button>
      </div>
    </div>
  );
}

function CustomerReports({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const { data, loading } = useCustomerReport(startDate, endDate);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data)
    return <div className="text-sm text-muted-foreground py-12 text-center">No data available</div>;

  const rows = [
    ["New Customers", data.newCustomers.toLocaleString()],
    ["Returning Customers", data.returningCustomers.toLocaleString()],
    ["VIP Customers", data.vipCustomers.toLocaleString()],
    ["Total Customers", data.totalCustomers.toLocaleString()],
    ["Avg Lifetime Value", `$${Number(data.averageLifetimeValue).toFixed(2)}`],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <DashboardCard
          label="New Customers"
          value={data.newCustomers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <DashboardCard
          label="Returning"
          value={data.returningCustomers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <DashboardCard
          label="VIP"
          value={data.vipCustomers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <DashboardCard
          label="Total"
          value={data.totalCustomers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <DashboardCard
          label="Avg LTV"
          value={`$${Number(data.averageLifetimeValue).toFixed(2)}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="flex gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportPDF(
              "Customer Report",
              ["Metric", "Value"],
              rows,
              `customer-report-${endDate || "all"}`,
            )
          }
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCSV(
              rows.map((r) => ({ Metric: r[0], Value: r[1] })),
              `customer-report-${endDate || "all"}`,
            )
          }
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
      </div>
    </div>
  );
}

function InventoryReports() {
  const { data, loading } = useInventoryReport();

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (!data)
    return <div className="text-sm text-muted-foreground py-12 text-center">No data available</div>;

  const rows = [
    ["Total Active Products", data.totalProducts.toLocaleString()],
    ["In Stock", data.inStock.toLocaleString()],
    ["Low Stock", data.lowStock.toLocaleString()],
    ["Out of Stock", data.outOfStock.toLocaleString()],
    ["Total Stock Value", `$${Number(data.totalStockValue).toLocaleString()}`],
    ["Recent Movements (30d)", data.recentMovements.toLocaleString()],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <DashboardCard
          label="Active Products"
          value={data.totalProducts.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          label="In Stock"
          value={data.inStock.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          label="Low Stock"
          value={data.lowStock.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          label="Out of Stock"
          value={data.outOfStock.toLocaleString()}
          icon={<Package className="h-4 w-4" />}
        />
        <DashboardCard
          label="Stock Value"
          value={`$${Number(data.totalStockValue).toLocaleString()}`}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <DashboardCard
          label="Movements (30d)"
          value={data.recentMovements.toLocaleString()}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="flex gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportPDF("Inventory Report", ["Metric", "Value"], rows, "inventory-report")
          }
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportCSV(
              rows.map((r) => ({ Metric: r[0], Value: r[1] })),
              "inventory-report",
            )
          }
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportExcel(
              [
                { Metric: "Total Products", Value: data.totalProducts },
                { Metric: "In Stock", Value: data.inStock },
              ],
              "inventory-report",
              "Inventory",
            )
          }
        >
          <Download className="h-3.5 w-3.5 mr-1.5" /> Excel
        </Button>
      </div>
    </div>
  );
}
