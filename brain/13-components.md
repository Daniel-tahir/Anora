# Reusable UI Components

This document outlines key reusable UI components, their props, states, and dependencies.

## Key Frontend Components

### 1. `ProductCard`
- **Path**: `src/components/site/ProductCard.tsx`
- **Purpose**: Displays product items in category lists and grids.
- **Props**:
  - `product` (Product object)
- **Features**:
  - Scale animations on hover.
  - Quick add-to-bag action.
  - Interactive wishlist heart toggle.
  - Out-of-stock layout overlays.

### 2. `Header`
- **Path**: `src/components/site/Header.tsx`
- **Purpose**: Top navigation layout for client navigation.
- **Features**:
  - Luxury typography and animated transitions.
  - Wishlist count indicator badge.
  - Cart drawer sidebar.
  - Mobile burger navigation dropdown and login shortcut button.

### 3. `PayPalPayment`
- **Path**: `src/components/payment/PayPalPayment.tsx`
- **Purpose**: Embeds PayPal Smart Payment Buttons.
- **Props**:
  - `amount` (Number)
  - `onSuccess` (Callback function)
- **Dependencies**: `@paypal/react-paypal-js`

### 4. `StripePaymentForm`
- **Path**: `src/components/payment/StripePaymentForm.tsx` (or embedded in hooks)
- **Purpose**: Renders Stripe Card Elements.
- **Dependencies**: `@stripe/react-stripe-js`

### 5. `CancelOrderDialog`
- **Path**: `src/routes/account.tsx`
- **Purpose**: Provides customers options to cancel pending, confirmed, or processing orders.
- **Features**: Dropdown reasons ("Changed my mind", "Ordered by mistake", etc.) and optional details.

### 6. `RequestRefundDialog`
- **Path**: `src/routes/account.tsx`
- **Purpose**: Provides customers options to submit refund requests for delivered orders.
- **Features**: Dropdown reasons ("Damaged Product", "Wrong Product", etc.) and text description fields.
