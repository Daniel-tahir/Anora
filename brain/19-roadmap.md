# Development Roadmap

This document outlines the development roadmap, completed features, in-progress tasks, and future feature plans.

## 1. Completed Milestones
- **Secure Guest Order Tracking**: 8-character uppercase alphanumeric tracking ID generation, public lookup routes, timeline visualization, return/refund triggers.
- **Production Payment Pipeline Hardening**: Stripe Elements Checkout integration, module-level singleton Stripe promise caching, PayPal Smart buttons SDK integration, server-side secure capture with validation.
- **Serverless Background Queue**: Single concurrency worker, atomic updates, and idempotency tracking for Vercel Serverless environments.
- **Interactive Wishlist Fixes**: Dynamics wishlist hydration and page rendering, corrected toggle success toast triggers.

## 2. In Progress
- **Refining Mobile Layouts**: Verifying touch target padding boundaries on compact device views (320px to 430px).
- **Audit Verification**: Checking logs parsing behaviors on server startup.

## 3. Future Roadmap Goals
- **Courier API Integrations**: Live shipping carrier link mapping (e.g. DHL, FedEx) inside tracking dashboard timelines.
- **SMS notifications**: Alerts for checkout confirmations and delivery statuses.
- **Localization**: Automatic currency conversion based on buyer location.
