# Admin Panel Features

This document highlights the back-office dashboard controllers, inventory alerts, product/category editors, order controllers, and analytics tools.

## Administration Views

### 1. Order Manager (`/admin/orders`)
- **Status Timeline Updater**: Modifies states (e.g. `confirmed`, `packed`, `out_for_delivery`, `shipped`, `delivered`, `cancelled`). Updates automatically write logs to `order_status_history`.
- **Internal Notes**: Admins can log private notes on orders.
- **Refund Handler**: Processes returned items, approves refund amounts, and initiates payment reversals.

### 2. Product and Collection Editors (`/admin/products`)
- **Stock Controllers**: Updates stock numbers, variant lists, prices, and size configurations.
- **Category Taxonomy Editor**: Manages hierarchy, slug configurations, and sort weights.

### 3. Inventory Threshold Alerts
- Displays items where total stock drops below defined threshold boundaries (`low_stock_threshold`).
- Displays alerts to streamline restock orders.

### 4. Finance & Analytics Dashboards
- Aggregates metrics (e.g. total revenue, average order value, cart abandonment ratios, active discount redemptions, and top-selling collections) using database metrics RPCs.

## Security Controls
- Accessible only if the user profile role evaluates to `admin` (verified via the `has_admin_role` RPC and client-side `<AdminGuard>`).
- Auto-timeout signs out inactive admins after **15 minutes** of idle state to secure office computers.
