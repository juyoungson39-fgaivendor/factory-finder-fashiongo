/**
 * Type definitions for the VendorAdmin AI Vendor External API.
 * Mirrors the contract defined in ~/Project/FGAngels/docs/api/ai-vendor-external-api-reference.md
 */

// --- API Response Wrapper ---

export interface VaApiResponse<T> {
  success: boolean;
  errorCode: string | null;
  message: string | null;
  data: T;
}

// --- Category ---

export interface FGCategory {
  categoryId: number;
  categoryName: string;
  parentCategoryId: number | null;
  level: number;
  subCategories: FGCategory[];
}

// --- Product ---

export interface FGProductListItem {
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

export interface FGProductImage {
  imageId: number;
  imageName: string;
  imageUrl: string;
  sortNo: number;
  colorId: number;
  isActive: boolean;
}

export interface FGProductDetail extends FGProductListItem {
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

export interface FGProductListResponse {
  items: FGProductListItem[];
  totalCount: number;
  page: number;
  size: number;
}

export interface FGProductRegistrationRequest {
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

// --- Best Seller ---

export interface FGBestSellerItem {
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

// --- Attributes ---

export interface FGAttributeOption {
  id: number;
  name: string;
  active: boolean;
}

export interface FGProductAttributes {
  bodySizes: FGAttributeOption[];
  fabrics: FGAttributeOption[];
  lengths: FGAttributeOption[];
  patterns: FGAttributeOption[];
  styles: FGAttributeOption[];
}

// --- Query Params ---

export interface FGProductListParams {
  wholesalerId: number;
  active?: boolean;
  categoryId?: number;
  page?: number;
  size?: number;
}
