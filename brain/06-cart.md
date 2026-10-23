# Shopping Cart Lifecycle

This document describes the customer shopping cart framework, storage caching, validation routines, and server synchronization flows.

## Cart Storage Modes

### Guest Cart
- **LocalStorage Mapping**: Persistent items are stored inside local storage under key `anora.customer.cart.v2`.
- **Validation**: Cart states are hydrated on system startup, verifying current products and filtering out/capping item counts based on live database stock constraints.

### Authenticated Profile Cart
- **Database Row Sync (`cart_items` table)**: Synchronized directly with the remote database for authenticated users.
- **Migration & Merging on Login**:
  - Once a guest signs up or logs in, the client calls `mergeGuestCartToUser(userId)`.
  - This function merges local cached cart arrays with database `cart_items` rows.
  - An atomic server sync (`syncCartWithServer()`) then updates the database.

## Verification & Stock Validation
- Before checkout or quantities updating, the client performs strict stock validation (`validateStockBeforeCheckout`).
- Keeps checkout items constrained: if the user requests more quantity than is available in stock, it automatically caps the item quantity to the maximum available quantity (`Math.min(requested, available)`). If the item is completely out of stock, it sets the quantity to 0 and removes the active flag.
- Triggers notifications reactive updating (`notify()`) to let the browser headers redraw the bag numbers.
