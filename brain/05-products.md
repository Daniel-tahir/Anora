# Products & Collections

This document outlines the product catalog structure, color/size variants, availability mechanics, inventory logging, category taxonomies, and related UI components.

## Product Schema & Structure
- **Product Entity (`products` table)**: Represents base styles (e.g., Silk Kaftans or Diamond Rings). Defined by common properties like `name`, `slug`, `price`, and `category_id`.
- **Variants (`product_variants` table)**: Maps variant adjustments (e.g., Blush color option or L size choice). Variants carry distinct SKU patterns, optional overrides on pricing, and individual stock limits.
- **Hierarchy (`categories` table)**:
  - Supports a clean parent-child relationship (e.g., Parent: Clothing; Child: Luxury Pret or Formal Wear).
  - Queried via custom RPC helpers (`get_products_by_category_slug`, `get_products_by_category_and_subcategory`).

## Image Management
- Product media rows are held inside the `product_images` table.
- Mapped using sort weights (`sort_order`). The lowest sort weight index acts as the primary layout display image.

## Search, Filters & Recommendations
- **Search Engine**: Exposes client-side scoring search maps (`scoreProduct` filter scoring matches on names, tags, subcategory tags, fabrics, and descriptions).
- **Related Recommendations**: Renders collections matching identical subcategory tags on individual detail routes.

## Inventory Engine & Low Stock Rules
- Checkout quantities are checked against the `stock` and `size_stock` database properties.
- Dynamic checkouts are protected from overselling by checkout session locks (`inventory_reservations` table locks stock configurations for a brief checkout buffer duration).
- Low inventory thresholds trigger admin warnings inside dashboard list panels.
