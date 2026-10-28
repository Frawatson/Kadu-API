/**
 * Catalog types — items and shop-defined categories.
 *
 * IMPORTANT: All prices are integer cents (USD).
 * $3.50 = 350. Never use floats for money.
 * Partners see their own BASE price — the customer-facing markup is
 * never shown in the partner portal.
 *
 * Mirrored verbatim from Kadu-Partners/src/types/catalog.ts — keep in sync.
 */

/**
 * Item lifecycle (ENG-109):
 *   ACTIVE   — listed and orderable.
 *   DISABLED — temporarily unavailable; hidden from customers, still
 *              shown to the partner (the "availability" toggle).
 *   ARCHIVED — removed from the working catalog but retained; only
 *              visible under the "Archived" filter, can be restored.
 */
export type ItemStatus = "ACTIVE" | "DISABLED" | "ARCHIVED";

export const ITEM_STATUSES: readonly ItemStatus[] = [
  "ACTIVE",
  "DISABLED",
  "ARCHIVED",
];

export function isItemStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface CatalogCategory {
  id: string;
  name: string;
  /** Live count of non-archived items in this category. */
  itemCount: number;
  displayOrder: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  categoryName: string;
  /** Partner's base price in USD cents (integer). */
  price: number;
  stockQuantity: number;
  stockStatus: StockStatus;
  /** Primary photo URL + additional photos */
  photos: string[];
  sku?: string;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemPayload {
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  stockQuantity: number;
  sku?: string;
}

export interface UpdateItemPayload extends Partial<CreateItemPayload> {
  status?: ItemStatus;
}

export interface CreateCategoryPayload {
  name: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  displayOrder?: number;
}

export type StockFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export type SortField = "NAME" | "PRICE_ASC" | "PRICE_DESC" | "STOCK" | "CREATED";
