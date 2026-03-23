# AI Vendor External API — User Guide

> Integration guide for FFF (Factory Finder FashionGo) to interact with the VendorAdmin product catalog.

## Overview

The AI Vendor External API allows the FFF system to manage vendor products on FashionGo through a set of RESTful endpoints. It provides capabilities to:

- Browse the FashionGo category tree (3-depth hierarchy)
- List, create, update, and deactivate products
- Retrieve best-selling items per vendor
- Look up product attribute options (sizes, patterns, fabrics, etc.)

All endpoints live under the `/external/ai-vendor/` path on the VendorAdmin API server.

---

## Authentication

All requests must include a **JWT Bearer token** in the `Authorization` header.

```
Authorization: Bearer <JWT_TOKEN>
```

### Token Requirements

| Property | Value |
|:---------|:------|
| Algorithm | HMAC-SHA256 |
| Expiry | **180 seconds** from `iat` (issued-at) |
| Format | `Bearer <token>` |

> **Note:** Authentication enforcement is currently **disabled** during development (filter bypass). It will be activated before production deployment. Ensure your integration generates valid tokens to avoid disruption when auth is enabled.

---

## Response Format

All endpoints return a unified `JsonResponse<T>` wrapper:

### Success

```json
{
  "success": true,
  "message": null,
  "data": { ... }
}
```

### Failure

```json
{
  "success": false,
  "message": "Error description here",
  "data": null
}
```

Always check `success` before processing `data`.

---

## Key Concepts

### Vendor Identification

Every request that touches product data requires a `wholesalerId` (Long). This is the FashionGo internal vendor ID. The API verifies ownership — you cannot read or modify products belonging to other vendors.

### Category Hierarchy (3-Depth)

FashionGo uses a 3-level category tree:

```
Level 1: ParentParentCategoryId  (e.g., "Women's Clothing")
  └─ Level 2: ParentCategoryId   (e.g., "Tops")
       └─ Level 3: CategoryId    (e.g., "Blouses")
```

When registering a product, you must provide all three IDs: `categoryId`, `parentCategoryId`, and `parentParentCategoryId`.

### Product Lifecycle

```
Register (POST) → Active Product → Update (PUT) → Deactivate (DELETE)
```

- Newly registered products are created with `active = true`.
- Deactivation is a soft-delete — the product is not removed, only marked inactive.
- There is no reactivation endpoint; use the update endpoint if needed.

### Audit Identity

All operations are recorded under the username `ai-vendor-external` for audit trail purposes.

---

## Quick Start

### 1. Get the Category Tree

```bash
curl -X GET "https://{host}/external/ai-vendor/categories" \
  -H "Authorization: Bearer <TOKEN>"
```

Browse the response to find the `categoryId` you need for product registration.

### 2. Get Available Attributes

```bash
curl -X GET "https://{host}/external/ai-vendor/attributes/123?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

Use the attribute IDs (sizeId, packId, patternId, etc.) when registering products.

### 3. Register a Product

```bash
curl -X POST "https://{host}/external/ai-vendor/products" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "wholesalerId": 456,
    "productName": "BL-2024-SPRING",
    "itemName": "Floral Blouse",
    "categoryId": 123,
    "parentCategoryId": 45,
    "parentParentCategoryId": 10,
    "unitPrice": 15.99,
    "unitPrice1": 19.99,
    "sizeId": 1,
    "packId": 2
  }'
```

### 4. List Your Products

```bash
curl -X GET "https://{host}/external/ai-vendor/products?wholesalerId=456&page=1&size=20" \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Check Best Sellers

```bash
curl -X GET "https://{host}/external/ai-vendor/products/best-sellers?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Error Handling

| Scenario | HTTP Status | `success` | `message` |
|:---------|:------------|:----------|:----------|
| Valid request | 200 | `true` | `null` |
| Missing required field | 200 | `false` | `"wholesalerId is required"` |
| Product not owned by vendor | 200 | `false` | `"Product not found or not owned by this vendor"` |
| Internal server error | 200 | `false` | Exception message |

> **Note:** The API always returns HTTP 200. Error state is indicated by `success: false` in the response body.

---

## Limitations

- **No image upload:** Product images cannot be uploaded through this API. Use the VendorAdmin web interface.
- **No inventory management:** Stock/inventory data is not managed through this API.
- **No bulk operations:** Products must be registered/updated one at a time.
- **Pagination max:** The `size` parameter for product listing defaults to 50.
