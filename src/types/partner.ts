/**
 * Partner / shop identity types.
 */

export interface Address {
  line1: string;
  line2?: string;
  /** Free-text directions / landmark notes ("Behind the red church"). */
  direction?: string;
  city: string;
  county?: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface DaySchedule {
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  open: boolean;
  openTime?: string;  // "08:00"
  closeTime?: string; // "18:00"
}

export interface SetupProgress {
  profileComplete: boolean;
  photosUploaded: boolean;
  catalogHasItems: boolean;
  payoutMethodSet: boolean;
  percentComplete: number; // 0–100
}

export interface ShopLocation {
  id: string;
  name: string;
  /** Business-type slug (e.g. "HARDWARE_STORE"). Optional for back-compat. */
  category?: string;
  description?: string;
  /** Storefront-level contact fields (filled in via the Add Store wizard). */
  email?: string;
  phone?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address: Address;
  hours: DaySchedule[];
  photos: string[];
  /** Per-store live/hidden flag — toggled from the Shop Profile page header. */
  shopEnabled?: boolean;
  /** Whether the storefront email has been verified (shows badge in profile). */
  emailVerified?: boolean;
  status: "ACTIVE" | "DISABLED" | "SETUP_INCOMPLETE";
  itemCount: number;
}

export interface PartnerProfile {
  id: string;
  businessName: string;
  businessPhone: string;
  businessType: string;
  email: string;
  ownerName: string;
  role: "OWNER" | "MANAGER";
  status: "PENDING_REVIEW" | "APPROVED" | "SUSPENDED";
  shopEnabled: boolean;
  setupProgress: SetupProgress;
  locations: ShopLocation[];
  activeLocationId: string;
  createdAt: string;
}

export type BusinessType =
  | "HARDWARE_STORE"
  | "PARTS_SHOP"
  | "BUILDING_MATERIALS"
  | "PAINT_FINISHING"
  | "AUTOMOTIVE_PARTS"
  | "ELECTRICAL_SUPPLIES"
  | "PLUMBING_SUPPLIES"
  | "GENERAL_SUPPLIES"
  | "OTHER";

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  HARDWARE_STORE: "Hardware Store",
  PARTS_SHOP: "Parts Shop",
  BUILDING_MATERIALS: "Building Materials",
  PAINT_FINISHING: "Paint & Finishing",
  AUTOMOTIVE_PARTS: "Automotive Parts",
  ELECTRICAL_SUPPLIES: "Electrical Supplies",
  PLUMBING_SUPPLIES: "Plumbing Supplies",
  GENERAL_SUPPLIES: "General Supplies",
  OTHER: "Other",
};

export type ProductCategory =
  | "PLUMBING_SUPPLIES"
  | "ELECTRICAL_SUPPLIES"
  | "PAINT_FINISHING"
  | "BUILDING_MATERIALS"
  | "TOOLS"
  | "AUTOMOTIVE_PARTS"
  | "HARDWARE_FASTENERS"
  | "SAFETY_EQUIPMENT"
  | "OTHER";

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  PLUMBING_SUPPLIES: "Plumbing Supplies",
  ELECTRICAL_SUPPLIES: "Electrical Supplies",
  PAINT_FINISHING: "Paint & Finishing",
  BUILDING_MATERIALS: "Building Materials",
  TOOLS: "Tools",
  AUTOMOTIVE_PARTS: "Automotive Parts",
  HARDWARE_FASTENERS: "Hardware & Fasteners",
  SAFETY_EQUIPMENT: "Safety Equipment",
  OTHER: "Other",
};
