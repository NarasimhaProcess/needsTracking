# Live Tracking, Delivery Dispatch & Map System Architecture

This document provides a comprehensive overview of the **Live Location Tracking**, **Delivery Manager Dispatch**, **Sellers Geolocation Map**, and **Automated Push Notification System** across the platform.

---

## 📑 Table of Contents
1. [Welcome Screen: Sellers-Only Map & 3-Dots Menu](#1-welcome-screen-sellers-only-map--3-dots-menu)
2. [Delivery Manager Dispatch & Available Tab Logic](#2-delivery-manager-dispatch--available-tab-logic)
3. [Live Location Tracking Architecture & Bike Icon](#3-live-location-tracking-architecture--bike-icon)
4. [Multi-Seller Order Splitting (Option A)](#4-multi-seller-order-splitting-option-a)
5. [Push Notifications Flow (Buyer, Seller, Delivery Partner)](#5-push-notifications-flow)
6. [Database Setup & Triggers](#6-database-setup--triggers)

---

## 1. Welcome Screen: Sellers-Only Map & 3-Dots Menu

### Key Functionality
- **Sellers-Only Map Display**:
  - Does **not** use customer personal data, customer images, or `area_master` circular overlays.
  - Queries verified sellers strictly from `profiles` table (`WHERE (role = 'seller' OR role = 'admin') AND latitude IS NOT NULL AND longitude IS NOT NULL`).
  - Displays custom store pins (`fas fa-store`) with interactive popups ("View Products" & "Directions").
- **Area & Seller Search Bar**:
  - Debounced auto-complete suggestions combining OpenStreetMap Nominatim place geocoding and local matching sellers.
  - Selecting an area or seller pans the map and brings up a sleek **Floating Seller Info Card** at the bottom showing store name, distance from user (e.g. `1.2 km away`), address, contact, and product count.
- **3 Horizontal Dots (`...`) Portals Menu**:
  - Replaces clutter on the map with a top-right `...` icon button.
  - Tapping opens an access modal with direct pathways:
    - 🛒 **Buyer Portal** (`BuyerLogin` / `Catalog`)
    - 🏪 **Seller Portal** (`SellerLogin`)
    - 🚚 **Delivery Partner Portal** (`DeliveryManagerLogin`)
    - **User Profile Summary & Quick Actions** (Orders, Cart, Store Management, Logout) when signed in.

**Source File**: [`src/screens/WelcomeScreen.js`](file:///workspaces/needsTracking/src/screens/WelcomeScreen.js)

---

## 2. Delivery Manager Dispatch & Available Tab Logic

### The "Notification Received but Available Tab Empty" Issue
When an order was placed, Delivery Managers received a push notification, but the order did not appear in the **Available** tab.

#### Root Cause: SQL 3-Valued Logic Trap
1. In PostgreSQL / PostgREST:
   ```javascript
   // Previous Query (Bug):
   supabase.from('orders').select(...).neq('order_type', 'shop-order');
   ```
2. When buyer orders were created without an explicit `order_type` (value was `NULL`), SQL evaluated `NULL != 'shop-order'` as `UNKNOWN` (`FALSE`).
3. As a result, PostgREST dropped all buyer orders from the query result.

#### The Fix
1. **Query Update**: Allowed `order_type IS NULL` or `order_type != 'shop-order'`:
   ```javascript
   // src/services/supabase.js
   export async function getAvailableDeliveryOrders() {
     return await supabase
       .from('orders')
       .select(...)
       .is('delivery_manager_id', null)
       .or('order_type.is.null,order_type.neq.shop-order')
       .neq('status', 'completed')
       .neq('status', 'cancelled')
       .order('created_at', { ascending: false });
   }
   ```
2. **Explicit Tagging**: Updated [`src/screens/CheckoutScreen.js`](file:///workspaces/needsTracking/src/screens/CheckoutScreen.js) to explicitly tag new buyer orders with `order_type: 'delivery'`.

---

## 3. Live Location Tracking Architecture

### How Live Location Streaming Works
The platform uses a **Hybrid Architecture** combining a single-row DB checkpoint with high-frequency WebSockets Pub/Sub:

```
[Delivery Partner GPS (watchPositionAsync)]
            │
            │ (every 5 seconds)
            ▼
[Supabase: delivery_partner_locations] (Single-row UPSERT per driver)
            │
            │ (Postgres Change Capture)
            ▼
[Supabase Realtime WebSocket Server]
            │
            │ (Sub-100ms Pub/Sub Broadcast)
            ▼
[Buyer / Seller Screen: OrderDetailScreen.js] (Live Map Marker Moves in Real Time)
```

### Technical Details & Bike Pin UI
- **Animated Delivery Bike Marker**:
  - Rendered with an animated radar pulse halo (`@keyframes radarRipple`) indicating live GPS broadcast.
  - High-res Delivery Scooter icon (`fas fa-motorcycle`) enclosed in a blue gradient circle with a `"🛵 In Transit"` floating badge.
  - Customer destination marker with a red gradient pin (`fas fa-home`) and `"📍 Delivery"` badge.
  - Styled dashed trajectory line between delivery partner and customer destination.
- **Zero Database Bloat**:
  - The driver app performs an `UPSERT` on `public.delivery_partner_locations` with `ON CONFLICT (partner_id) DO UPDATE`.
  - The table size is strictly **1 row per driver** (e.g. 5 active drivers = 5 total rows).
- **Fast Initial Render**:
  - When the Buyer or Seller opens the order details screen, the last known location loads immediately from the database without waiting for the next GPS tick.
- **Cross-Platform Map**:
  - Rendered via [`src/components/UniversalWebView.js`](file:///workspaces/needsTracking/src/components/UniversalWebView.js) with Leaflet, working identically on Web, iOS, and Android.
  - Features a direct 📞 **"Call Delivery Partner"** button and live order status tracker.

**Source Files**:
- [`src/screens/DeliveryManagerDashboard.js`](file:///workspaces/needsTracking/src/screens/DeliveryManagerDashboard.js)
- [`src/screens/OrderDetailScreen.js`](file:///workspaces/needsTracking/src/screens/OrderDetailScreen.js)
- [`src/services/supabase.js`](file:///workspaces/needsTracking/src/services/supabase.js)

---

## 4. Multi-Seller Order Splitting (Option A)

### How Multi-Store Carts are Processed
When a buyer checks out with items originating from multiple different sellers:
1. **Grouping by Seller**: The app groups cart items by vendor ID (`products.user_id`).
2. **Sub-Order Generation**:
   - Creates **Order #1** for **Seller A** with Seller A's subtotal and items.
   - Creates **Order #2** for **Seller B** with Seller B's subtotal and items.
3. **Independent Dispatch & Logistics**:
   - Each order triggers its own delivery manager assignment (`assign-delivery-manager`).
   - Separate delivery partners can pick up and deliver from each store without pickup location conflicts.
   - Each seller independently manages preparation and completion in their dashboard.

**Source File**: [`src/screens/CheckoutScreen.js`](file:///workspaces/needsTracking/src/screens/CheckoutScreen.js)

---

## 5. Push Notifications Flow

| Event | Recipient | Notification Title | Message Content |
| :--- | :--- | :--- | :--- |
| **New Order Created** | **Buyer** | `🛍️ Order Placed!` | Your order #... for ₹... has been placed. |
| **New Order Created** | **Seller** | `🎉 New Order Received!` | Your product ... was ordered by ... |
| **New Order Created** | **Delivery Partners** | `🛵 New Delivery Order!` | Order #... (₹...) is ready for pickup. |
| **Partner Accepts Order** | **Buyer** | `🛵 Delivery Partner Assigned!` | [Name] has accepted your order #... and is picking it up. |
| **Partner Accepts Order** | **Seller** | `🛵 Delivery Partner Claimed Order` | [Name] has accepted order #... for pickup. |
| **Status: Out for Delivery**| **Buyer** | `🚚 Order Out for Delivery!` | [Name] is on the way with your order #... Track live! |
| **Status: Completed** | **Buyer** | `✅ Order Delivered!` | Your order #... has been successfully delivered. |
| **Status: Completed** | **Seller** | `✅ Order Delivered!` | Order #... has been delivered successfully. |

---

## 6. Database Setup & Triggers

To enable the automated push notifications to Buyers and Sellers on delivery assignment and status updates, execute the migration script in your **Supabase SQL Editor**:

📄 **Migration File**: [`notify_buyer_seller_on_delivery_update.sql`](file:///workspaces/needsTracking/notify_buyer_seller_on_delivery_update.sql)

```sql
-- Creates trigger: on_order_status_and_delivery_notify on public.orders
-- Dispatches Expo push notifications to Buyer and Seller automatically on:
-- 1. delivery_manager_id assignment
-- 2. status transitions (Out for Delivery, Completed, Cancelled)
```
