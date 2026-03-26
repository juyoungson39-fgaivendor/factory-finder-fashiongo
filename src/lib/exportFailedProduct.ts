/**
 * Export failed FG product registration details to an Excel file for download.
 * The exported file is designed to be re-uploaded to the FG system for item creation.
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export interface FailedProductInfo {
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
  imageUrl?: string;
  colorId?: number;
  autoActivate?: boolean;
}

export function exportFailedProduct(product: FailedProductInfo, filename?: string) {
  exportFailedProducts([product], filename);
}

export function exportFailedProducts(products: FailedProductInfo[], filename?: string) {
  const rows = products.map((p) => ({
    wholesalerId: p.wholesalerId,
    productName: p.productName,
    itemName: p.itemName,
    categoryId: p.categoryId,
    parentCategoryId: p.parentCategoryId,
    parentParentCategoryId: p.parentParentCategoryId,
    unitPrice: p.unitPrice ?? '',
    unitPrice1: p.unitPrice1 ?? '',
    sizeId: p.sizeId ?? '',
    packId: p.packId ?? '',
    madeIn: p.madeIn ?? '',
    fabricDescription: p.fabricDescription ?? '',
    weight: p.weight ?? '',
    bodySizeId: p.bodySizeId ?? '',
    patternId: p.patternId ?? '',
    lengthId: p.lengthId ?? '',
    styleId: p.styleId ?? '',
    fabricId: p.fabricId ?? '',
    occasionId: p.occasionId ?? '',
    seasonId: p.seasonId ?? '',
    holidayId: p.holidayId ?? '',
    description: p.description ?? '',
    vendorCategoryId: p.vendorCategoryId ?? '',
    imageUrl: p.imageUrl ?? '',
    colorId: p.colorId ?? '',
    autoActivate: p.autoActivate != null ? p.autoActivate : '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width columns
  const colWidths = Object.keys(rows[0]).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? '').length),
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const name = filename ?? `FG_failed_products_${ts}.xlsx`;

  saveAs(blob, name);
}
