/**
 * Catalog types — items and shop-defined categories.
 *
 * IMPORTANT: All prices are integer cents (USD).
 * $3.50 = 350. Never use floats for money.
 * Partners see their own BASE price — the customer-facing markup is
 * never shown in the partner portal.
 */

export type ItemStatus = "ACTIVE" | "DISABLED";

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface CatalogCategory {
  id: string;
  name: string;
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

export type StockFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export type SortField = "NAME" | "PRICE_ASC" | "PRICE_DESC" | "STOCK" | "CREATED";
