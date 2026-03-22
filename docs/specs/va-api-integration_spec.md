# [SPEC] VA API Integration — FashionGo Product Management

**Status:** Draft
**Author:** Tech Lead (Tony)
**Date:** 2026-03-23
**Target Component:** factory-finder-fashiongo (FFF)

## 1. Overview

Connect FFF to the VendorAdmin External API (`/external/ai-vendor/*`) to replace all hardcoded mock data with real FashionGo product operations. This enables:

- Real category browsing (3-depth hierarchy)
- Product CRUD (list, register, update, deactivate)
- Best-seller retrieval per vendor
- Product attribute lookup per category
- Settings migration from localStorage to API-backed data

**Reference:** `~/Project/FGAngels/docs/api/ai-vendor-external-api-reference.md`

---

## 2. Data Model (Schema & Types)

> All types mirror the VA API response contracts. No DB migration needed — FFF reads from VA API, writes to VA API.

### 2.1. API Response Wrapper

```typescript
interface VaApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T;
}
```

### 2.2. Category Types

```typescript
interface FGCategory {
  categoryId: number;
  categoryName: string;
  parentCategoryId: number | null;
  level: number;
  subCategories: FGCategory[];
}
```

### 2.3. Product Types

```typescript
interface FGProductListItem {
  productId: number;
  styleNo: string;
  itemName: string;
  isActive: boolean;
  categoryId: number;
  vendorCategoryId: number | null;
  imageUrl: string | null;
  unitPrice: number;
  unitPrice1: number;
  createdOn: string;
  activatedOn: string | null;
  modifiedOn: string | null;
}

interface FGProductDetail extends FGProductListItem {
  wholesalerId: number;
  description: string | null;
  categoryName: string | null;
  parentCategoryId: number;
  parentParentCategoryId: number;
  msrp: number | null;
  madeIn: string | null;
  fabricDescription: string | null;
  weight: number | null;
  sizeId: number | null;
  packId: number | null;
  bodySizeId: number | null;
  patternId: number | null;
  lengthId: number | null;
  styleId: number | null;
  fabricId: number | null;
  occasionId: number | null;
  seasonId: number | null;
  holidayId: number | null;
  images: FGProductImage[];
}

interface FGProductImage {
  imageId: number;
  imageName: string;
  imageUrl: string;
  sortNo: number;
  colorId: number;
  isActive: boolean;
}

interface FGProductListResponse {
  items: FGProductListItem[];
  totalCount: number;
  page: number;
  size: number;
}

interface FGProductRegistrationRequest {
  wholesalerId: number;
  productName: string;
  itemName: string;
  categoryId: number;
  parentCategoryId: number;
  parentParentCategoryId: number;
  unitPrice?: number;
  unitPrice1?: number;
  sizeId?: number;
  packId?: number;
  madeIn?: string;
  fabricDescription?: string;
  weight?: number;
  bodySizeId?: number;
  patternId?: number;
  lengthId?: number;
  styleId?: number;
  fabricId?: number;
  occasionId?: number;
  seasonId?: number;
  holidayId?: number;
  description?: string;
  vendorCategoryId?: number;
}
```

### 2.4. Best Seller Types

```typescript
interface FGBestSellerItem {
  itemId: number;
  vendorId: number;
  referenceId: number;
  listOrder: number;
  imageUrl: string | null;
  product: {
    productId: number;
    productName: string;
    itemName: string;
  };
}
```

### 2.5. Attribute Types

```typescript
interface FGAttributeOption {
  id: number;
  name: string;
  active: boolean;
}

interface FGProductAttributes {
  bodySizes: FGAttributeOption[];
  fabrics: FGAttributeOption[];
  lengths: FGAttributeOption[];
  patterns: FGAttributeOption[];
  styles: FGAttributeOption[];
}
```

---

## 3. Interface Design (API Client)

### 3.1. Environment Configuration

```
VITE_VA_API_BASE_URL=http://localhost:{port}
```

> Port will be provided by the user at runtime. Auth is currently disabled (dev mode).

### 3.2. HTTP Client — `src/integrations/va-api/client.ts`

A thin `fetch`-based wrapper. No axios dependency (project has none).

**Public API:**

```typescript
const vaApi = {
  get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
};
```

**Behavior:**
- Base URL from `import.meta.env.VITE_VA_API_BASE_URL`
- All requests set `Content-Type: application/json`
- All responses unwrap `VaApiResponse<T>` — if `success === false`, throw `VaApiError(message)`
- Query params appended via `URLSearchParams`
- No auth header for now (dev bypass). Placeholder for future JWT injection.

### 3.3. React Query Hooks — `src/integrations/va-api/hooks/`

All hooks follow existing project pattern: `useQuery` / `useMutation` + toast notifications.

| Hook | File | Method | Endpoint | Query Key |
|:-----|:-----|:-------|:---------|:----------|
| `useCategories` | `use-categories.ts` | GET | `/external/ai-vendor/categories` | `['va-api', 'categories']` |
| `useProducts` | `use-products.ts` | GET | `/external/ai-vendor/products` | `['va-api', 'products', params]` |
| `useProductDetail` | `use-products.ts` | GET | `/external/ai-vendor/products/{id}` | `['va-api', 'product', id]` |
| `useBestSellers` | `use-products.ts` | GET | `/external/ai-vendor/products/best-sellers` | `['va-api', 'best-sellers', wholesalerId]` |
| `useAttributes` | `use-attributes.ts` | GET | `/external/ai-vendor/attributes/{categoryId}` | `['va-api', 'attributes', categoryId]` |
| `useRegisterProduct` | `use-products.ts` | POST | `/external/ai-vendor/products` | mutation, invalidates `['va-api', 'products']` |
| `useUpdateProduct` | `use-products.ts` | PUT | `/external/ai-vendor/products/{id}` | mutation, invalidates `['va-api', 'product', id]` |
| `useDeactivateProduct` | `use-products.ts` | PUT | `/external/ai-vendor/products/{id}/deactivate` | mutation, invalidates `['va-api', 'products']` |

**Hook Signature Examples:**

```typescript
// Query
function useCategories(): UseQueryResult<FGCategory[]>;

function useProducts(params: {
  wholesalerId: number;
  active?: boolean;
  categoryId?: number;
  page?: number;
  size?: number;
}): UseQueryResult<FGProductListResponse>;

function useProductDetail(
  productId: number,
  wholesalerId: number,
): UseQueryResult<FGProductDetail>;

function useBestSellers(wholesalerId: number): UseQueryResult<FGBestSellerItem[]>;

function useAttributes(
  categoryId: number,
  wholesalerId: number,
): UseQueryResult<FGProductAttributes>;

// Mutation
function useRegisterProduct(): UseMutationResult<FGProductDetail, Error, FGProductRegistrationRequest>;

function useUpdateProduct(productId: number): UseMutationResult<FGProductDetail, Error, FGProductRegistrationRequest>;

function useDeactivateProduct(): UseMutationResult<boolean, Error, { productId: number; wholesalerId: number }>;
```

---

## 4. Internal Component Design (File Structure)

```
src/integrations/va-api/
├── client.ts              # HTTP client (fetch wrapper + error handling)
├── types.ts               # All TypeScript interfaces from Section 2
└── hooks/
    ├── use-categories.ts  # useCategories hook
    ├── use-products.ts    # useProducts, useProductDetail, useBestSellers,
    │                      # useRegisterProduct, useUpdateProduct, useDeactivateProduct
    └── use-attributes.ts  # useAttributes hook
```

**No other files needed.** Pages import hooks directly.

---

## 5. Business Logic & Algorithms

### 5.1. Client Request Flow

```
Page Component
  → React Query Hook (useProducts, etc.)
    → vaApi.get/post/put (client.ts)
      → fetch() to VA API localhost
        → Unwrap VaApiResponse<T>
          → IF success === true: return data
          → IF success === false: throw VaApiError(message)
    → onError: toast({ variant: 'destructive', description: error.message })
```

### 5.2. Mock Data Replacement Plan

| Page | Current Mock | Replacement Hook | wholesalerId Source |
|:-----|:------------|:-----------------|:-------------------|
| `ProductList.tsx` | `ALL_PRODUCTS` (29 items) | `useProducts()` | Vendor context / settings |
| `Dashboard.tsx` | `CONFIRM_PRODUCTS` (12 items) | `useProducts({ active: true })` + `useBestSellers()` | Per vendor |
| `AIVendors.tsx` | `VENDORS` (6 vendors) | Keep vendor config local; enrich with `useProducts({ wholesalerId })` count | Each vendor's wholesalerId |
| `FGRegistrationSheet.tsx` | localStorage categories | `useCategories()` + `useAttributes()` | From form context |
| `PricingSettings.tsx` | localStorage only | Phase 2 (Supabase `settings` table) — out of scope | — |
| `FashionGoPage.tsx` | `STATIC_RECENT_ANALYSES` | Keep (Supabase-backed trend data) | — |

### 5.3. Vendor-to-WholesalerId Mapping

FFF manages 6 AI Vendor personas. Each must map to a FashionGo `wholesalerId`. This mapping will be stored in the existing vendor configuration (currently in `AIVendors.tsx`).

```typescript
// Extend existing VENDORS constant
interface AIVendorConfig {
  id: string;           // e.g., 'basic', 'denim'
  name: string;         // e.g., 'BASIC'
  wholesalerId: number; // FashionGo vendor ID — to be configured
  // ... existing fields
}
```

> **Action Required:** User must provide the 6 wholesalerId values before product API calls can work.

### 5.4. Error Handling Strategy

```typescript
class VaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaApiError';
  }
}
```

- All API errors surface via React Query's `onError` → toast notification
- No retry for mutations. Queries use React Query default retry (3 times).
- Network errors (fetch failure) caught and wrapped as VaApiError.

---

## 6. Security & Constraints

- **Authentication:** Currently disabled (dev bypass). JWT Bearer token support is scaffolded but not active.
- **Secrets:** Future `VITE_VA_API_KEY` for JWT signing. Use `${VITE_VA_API_KEY}` placeholder.
- **CORS:** VA API localhost must allow requests from FFF dev server (localhost:8080). If CORS issues arise, configure VA API or use Vite proxy.
- **No DDL:** This feature creates no database tables. All data flows through VA API.
- **No Bulk Ops:** Products are registered one at a time per API limitation.
- **Image Upload:** Not supported via this API. Out of scope.

---

## 7. Implementation Order

1. **Phase 1:** `client.ts` + `types.ts` — foundation
2. **Phase 2:** `use-categories.ts` + `use-attributes.ts` — category tree + attributes
3. **Phase 3:** `use-products.ts` — all product hooks (CRUD + list + best-sellers)
4. **Phase 4:** Page integration — replace mock data in ProductList, Dashboard, FGRegistrationSheet
5. **Phase 5:** Verify with live VA API calls

> Each phase is independently testable. SWE should verify each hook against localhost before proceeding to page integration.
