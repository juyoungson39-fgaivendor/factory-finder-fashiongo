# API Reference: AI Vendor External API

**Base URL:** `/external/ai-vendor`
**Version:** 1.0.0
**Content-Type:** `application/json`

## 1. Authentication

All requests must include a JWT Bearer token in the header.

```bash
Authorization: Bearer <JWT_TOKEN>
```

Token is signed with HMAC-SHA256 and must be issued within the last 180 seconds.

---

## 2. Resources & Endpoints

### 2.1. Categories

#### `GET /categories`

> Retrieve the full FashionGo category hierarchy tree (3-depth).

**Parameters:** None

**Example Request:**

```bash
curl -X GET "https://{host}/external/ai-vendor/categories" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": [
    {
      "categoryId": 1,
      "categoryName": "Women's Clothing",
      "parentCategoryId": null,
      "level": 1,
      "subCategories": [
        {
          "categoryId": 10,
          "categoryName": "Tops",
          "parentCategoryId": 1,
          "level": 2,
          "subCategories": [
            {
              "categoryId": 100,
              "categoryName": "Blouses",
              "parentCategoryId": 10,
              "level": 3,
              "subCategories": []
            }
          ]
        }
      ]
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|:------|:-----|:------------|
| `categoryId` | Integer | Unique category identifier |
| `categoryName` | String | Display name of the category |
| `parentCategoryId` | Integer | Parent category ID (`null` for root) |
| `level` | Integer | Depth level (1, 2, or 3) |
| `subCategories` | Array | Nested child categories (empty array `[]` for leaf nodes) |

---

### 2.2. Products

#### `GET /products`

> Retrieve a paginated list of products for a vendor.

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `wholesalerId` | Long | Query | **Yes** | Vendor ID |
| `active` | Boolean | Query | No | Filter by active status (`true`/`false`) |
| `categoryId` | Integer | Query | No | Filter by category ID |
| `page` | int | Query | No | Page number (default: `1`) |
| `size` | int | Query | No | Items per page (default: `50`) |

**Example Request:**

```bash
curl -X GET "https://{host}/external/ai-vendor/products?wholesalerId=456&active=true&page=1&size=20" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": {
    "items": [
      {
        "productId": 12345,
        "styleNo": "BL-2024-SPRING",
        "itemName": "Floral Blouse",
        "isActive": true,
        "categoryId": 100,
        "vendorCategoryId": 5,
        "imageUrl": "https://images.fashiongo.net/product/12345.jpg",
        "unitPrice": 15.99,
        "unitPrice1": 19.99,
        "createdOn": "2026-03-20T10:30:00",
        "activatedOn": "2026-03-20T10:30:00",
        "modifiedOn": "2026-03-22T14:00:00"
      }
    ],
    "totalCount": 150,
    "page": 1,
    "size": 20
  }
}
```

**Response Fields (`data`):**

| Field | Type | Description |
|:------|:-----|:------------|
| `items` | Array | List of product objects (see table below) |
| `totalCount` | int | Total number of matching products |
| `page` | int | Current page number |
| `size` | int | Requested page size |

**Product List Item Fields:**

| Field | Type | Description |
|:------|:-----|:------------|
| `productId` | Integer | Unique product identifier |
| `styleNo` | String | Style number (product name / SKU) |
| `itemName` | String | Display name of the product |
| `isActive` | Boolean | Whether the product is active |
| `categoryId` | Integer | Category ID (level 3) |
| `vendorCategoryId` | Integer | Vendor-specific category ID |
| `imageUrl` | String | Primary image URL |
| `unitPrice` | BigDecimal | Selling price |
| `unitPrice1` | BigDecimal | Listing price |
| `createdOn` | DateTime | Product creation timestamp |
| `activatedOn` | DateTime | Last activation timestamp |
| `modifiedOn` | DateTime | Last modification timestamp |

---

#### `POST /products`

> Register a new product.

**Request Body:**

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `wholesalerId` | Long | **Yes** | Vendor ID |
| `productName` | String | **Yes** | Style number / SKU |
| `itemName` | String | **Yes** | Display name |
| `categoryId` | Integer | **Yes** | Category ID (level 3) |
| `parentCategoryId` | Integer | **Yes** | Parent category ID (level 2) |
| `parentParentCategoryId` | Integer | **Yes** | Top-level category ID (level 1) |
| `unitPrice` | BigDecimal | No | Selling price |
| `unitPrice1` | BigDecimal | No | Listing price |
| `sizeId` | Integer | No | Size attribute ID |
| `packId` | Integer | No | Pack attribute ID |
| `madeIn` | String | No | Country of origin |
| `fabricDescription` | String | No | Fabric description text |
| `weight` | BigDecimal | No | Product weight |
| `bodySizeId` | Integer | No | Body size attribute ID |
| `patternId` | Integer | No | Pattern attribute ID |
| `lengthId` | Integer | No | Length attribute ID |
| `styleId` | Integer | No | Style attribute ID |
| `fabricId` | Integer | No | Fabric attribute ID |
| `occasionId` | Integer | No | Occasion attribute ID |
| `seasonId` | Integer | No | Season attribute ID |
| `holidayId` | Integer | No | Holiday attribute ID |
| `description` | String | No | Product description (HTML allowed) |
| `vendorCategoryId` | Integer | No | Vendor-specific category ID |

**Example Request:**

```bash
curl -X POST "https://{host}/external/ai-vendor/products" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "wholesalerId": 456,
    "productName": "BL-2024-SPRING",
    "itemName": "Floral Blouse",
    "categoryId": 100,
    "parentCategoryId": 10,
    "parentParentCategoryId": 1,
    "unitPrice": 15.99,
    "unitPrice1": 19.99,
    "sizeId": 1,
    "packId": 2,
    "madeIn": "China",
    "fabricDescription": "100% Polyester",
    "description": "<p>Beautiful floral blouse for spring.</p>"
  }'
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": {
    "productId": 12345,
    "wholesalerId": 456,
    "styleNo": "BL-2024-SPRING",
    "itemName": "Floral Blouse",
    "description": "<p>Beautiful floral blouse for spring.</p>",
    "isActive": true,
    "categoryId": 100,
    "categoryName": null,
    "parentCategoryId": 10,
    "parentParentCategoryId": 1,
    "unitPrice": 15.99,
    "unitPrice1": 19.99,
    "msrp": null,
    "madeIn": "China",
    "fabricDescription": "100% Polyester",
    "weight": null,
    "sizeId": 1,
    "packId": 2,
    "bodySizeId": null,
    "patternId": null,
    "lengthId": null,
    "styleId": null,
    "fabricId": null,
    "imageUrl": null,
    "images": [],
    "createdOn": "2026-03-23T10:30:00",
    "activatedOn": null,
    "modifiedOn": null,
    "vendorCategoryId": null
  }
}
```

---

#### `GET /products/best-sellers`

> Retrieve the best-selling items for a vendor.

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `wholesalerId` | Long | Query | **Yes** | Vendor ID |

**Example Request:**

```bash
curl -X GET "https://{host}/external/ai-vendor/products/best-sellers?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": [
    {
      "itemId": 789,
      "vendorId": 456,
      "referenceId": 12345,
      "listOrder": 1,
      "imageUrl": "https://images.fashiongo.net/product/12345.jpg",
      "product": {
        "productId": 12345,
        "productName": "BL-2024-SPRING",
        "itemName": "Floral Blouse"
      }
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|:------|:-----|:------------|
| `itemId` | Integer | Featured item entry ID |
| `vendorId` | long | Vendor ID |
| `referenceId` | int | Referenced product ID |
| `listOrder` | int | Display order (1 = top seller) |
| `imageUrl` | String | Product image URL |
| `product` | Object | Nested product summary |

---

#### `GET /products/{productId}`

> Retrieve a single product with full detail (including images and category info).

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `productId` | Integer | Path | **Yes** | Product ID |
| `wholesalerId` | Long | Query | **Yes** | Vendor ID (for ownership verification) |

**Example Request:**

```bash
curl -X GET "https://{host}/external/ai-vendor/products/12345?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": {
    "productId": 12345,
    "wholesalerId": 456,
    "styleNo": "BL-2024-SPRING",
    "itemName": "Floral Blouse",
    "description": "<p>Beautiful floral blouse for spring.</p>",
    "isActive": true,
    "categoryId": 100,
    "categoryName": "Blouses",
    "parentCategoryId": 10,
    "parentParentCategoryId": 1,
    "unitPrice": 15.99,
    "unitPrice1": 19.99,
    "msrp": 29.99,
    "madeIn": "China",
    "fabricDescription": "100% Polyester",
    "weight": 0.25,
    "sizeId": 1,
    "packId": 2,
    "bodySizeId": 3,
    "patternId": null,
    "lengthId": null,
    "styleId": null,
    "fabricId": null,
    "imageUrl": "https://images.fashiongo.net/product/12345.jpg",
    "images": [
      {
        "imageId": 1001,
        "imageName": "front.jpg",
        "imageUrl": "https://images.fashiongo.net/product/12345_1.jpg",
        "sortNo": 1,
        "colorId": 10,
        "isActive": true
      },
      {
        "imageId": 1002,
        "imageName": "back.jpg",
        "imageUrl": "https://images.fashiongo.net/product/12345_2.jpg",
        "sortNo": 2,
        "colorId": 10,
        "isActive": true
      }
    ],
    "createdOn": "2026-03-20T10:30:00",
    "activatedOn": "2026-03-20T10:30:00",
    "modifiedOn": "2026-03-22T14:00:00",
    "vendorCategoryId": 5
  }
}
```

**Image Info Fields:**

| Field | Type | Description |
|:------|:-----|:------------|
| `imageId` | Integer | Image ID |
| `imageName` | String | Image file name |
| `imageUrl` | String | Full image URL |
| `sortNo` | Integer | Display order |
| `colorId` | Integer | Associated color ID |
| `isActive` | Boolean | Whether the image is active |

**Error Response:**

```json
{
  "success": false,
  "message": "Product not found or not owned by this vendor",
  "data": null
}
```

---

#### `PUT /products/{productId}`

> Update an existing product. Only provided fields will be updated.

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `productId` | Integer | Path | **Yes** | Product ID to update |

**Request Body:** Same as `POST /products` (see registration fields above). `wholesalerId` is **required** for ownership verification.

**Example Request:**

```bash
curl -X PUT "https://{host}/external/ai-vendor/products/12345" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "wholesalerId": 456,
    "itemName": "Updated Floral Blouse",
    "unitPrice": 14.99,
    "description": "<p>Updated description.</p>"
  }'
```

**Response (200 OK):** Returns the updated product in the same format as `GET /products/{productId}` (without images).

**Error Response:**

```json
{
  "success": false,
  "message": "Product not found or not owned by this vendor",
  "data": null
}
```

---

#### `DELETE /products/{productId}`

> Deactivate (soft-delete) a product. The product is not removed, only marked inactive.

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `productId` | Integer | Path | **Yes** | Product ID to deactivate |
| `wholesalerId` | Long | Query | **Yes** | Vendor ID (for ownership verification) |

**Example Request:**

```bash
curl -X DELETE "https://{host}/external/ai-vendor/products/12345?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": true
}
```

---

### 2.3. Attributes

#### `GET /attributes/{categoryId}`

> Retrieve available product attribute options for a specific category. Use the returned IDs when registering or updating products.

**Parameters:**

| Name | Type | In | Required | Description |
|:-----|:-----|:---|:---------|:------------|
| `categoryId` | Integer | Path | **Yes** | Category ID (level 3) |
| `wholesalerId` | Long | Query | **Yes** | Vendor ID |

**Example Request:**

```bash
curl -X GET "https://{host}/external/ai-vendor/attributes/100?wholesalerId=456" \
  -H "Authorization: Bearer <TOKEN>"
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": null,
  "data": {
    "bodySizes": [
      { "id": 1, "name": "S", "active": true },
      { "id": 2, "name": "M", "active": true },
      { "id": 3, "name": "L", "active": true }
    ],
    "fabrics": [
      { "id": 1, "name": "Cotton", "active": true },
      { "id": 2, "name": "Polyester", "active": true }
    ],
    "lengths": [
      { "id": 1, "name": "Short", "active": true },
      { "id": 2, "name": "Long", "active": true }
    ],
    "patterns": [
      { "id": 1, "name": "Solid", "active": true },
      { "id": 2, "name": "Floral", "active": true }
    ],
    "styles": [
      { "id": 1, "name": "Casual", "active": true },
      { "id": 2, "name": "Formal", "active": true }
    ]
  }
}
```

**Attribute Object Fields:**

| Field | Type | Description |
|:------|:-----|:------------|
| `id` | int | Attribute ID (use this in product registration) |
| `name` | String | Display name |
| `active` | boolean | Whether the attribute is currently active |

**Attribute-to-Product Field Mapping:**

| Attribute Group | Product Field |
|:----------------|:-------------|
| `bodySizes` | `bodySizeId` |
| `fabrics` | `fabricId` |
| `lengths` | `lengthId` |
| `patterns` | `patternId` |
| `styles` | `styleId` |

---

## 3. Error Codes

All endpoints return HTTP 200. Error state is communicated via the `success` field.

| `success` | `message` | Cause |
|:----------|:----------|:------|
| `false` | `"wholesalerId is required"` | Missing `wholesalerId` in request |
| `false` | `"Product not found or not owned by this vendor"` | Invalid `productId` or ownership mismatch |
| `false` | `"Product registration failed: ..."` | Internal error during product creation |
| `false` | `"Product update failed: ..."` | Internal error during product update |
| `false` | `"DetailProductResponse must not be null"` | Product was saved but could not be retrieved |
| `false` | *(varies)* | Unexpected server error |

---

## 4. Endpoint Summary

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/external/ai-vendor/categories` | Full category hierarchy tree |
| `GET` | `/external/ai-vendor/products` | Paginated product list |
| `POST` | `/external/ai-vendor/products` | Register a new product |
| `GET` | `/external/ai-vendor/products/best-sellers` | Best-selling items |
| `GET` | `/external/ai-vendor/products/{productId}` | Product detail with images |
| `PUT` | `/external/ai-vendor/products/{productId}` | Update a product |
| `DELETE` | `/external/ai-vendor/products/{productId}` | Deactivate a product |
| `GET` | `/external/ai-vendor/attributes/{categoryId}` | Category attribute options |
