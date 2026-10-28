import type { PartnerProfile, ShopLocation } from "../types/partner";
import type { CatalogCategory, CatalogItem } from "../types/catalog";
import type { MaterialsOrder } from "../types/order";
import type { Review } from "../types/review";
import type {
  Invitation,
  NotificationPrefs,
  SettingsGeneral,
  TeamMember,
} from "../types/settings";
import type { WalletSummary, Transaction, PayoutMethod } from "../types/wallet";

// ─── Shop Locations ──────────────────────────────────────────────────────────

/**
 * Per-partner location store (in-memory, smoke-test only).
 *
 * Real backend will model `Location` as a Postgres table FK'd to
 * `Partner`. For the smoke-test Fastify backend we keep an in-process
 * map keyed by partner id. The seeded demo partner is special-cased
 * to use `mockLocations` directly so the demo still has rich content.
 * New partners start with `[]` and append via the Add-Store wizard.
 */
export const partnerLocations: Map<string, ShopLocation[]> = new Map();

/**
 * Per-partner catalog items. The seeded demo partner shares `mockItems`
 * (rich fixtures); new partners get their own array so a POST /catalog
 * actually shows up on the next GET.
 */
export const partnerCatalog: Map<string, CatalogItem[]> = new Map();

/**
 * Per-partner shop categories. The seeded demo partner shares
 * `mockCategories`; new partners start from a private copy of the default
 * taxonomy so renames/deletes never leak between partners.
 */
export const partnerCategories: Map<string, CatalogCategory[]> = new Map();

/**
 * Per-partner payout methods. Same scoping reason as above — new
 * partners' POSTs need to round-trip through their own GET.
 */
export const partnerPayoutMethods: Map<string, PayoutMethod[]> = new Map();

export const mockLocations: ShopLocation[] = [
  {
    id: "loc-001",
    name: "Broad Street Store",
    category: "HARDWARE_STORE",
    description:
      "Local hardware store supplying plumbing, electrical and construction materials for contractors.",
    email: "broadst@monroviahardware.lr",
    emailVerified: true,
    phone: "+231770123456",
    contactPerson: "John Doe",
    contactEmail: "john@monroviahardware.lr",
    contactPhone: "+231770123456",
    address: {
      line1: "14 Broad Street",
      direction: "Behind the red church on the left",
      city: "Monrovia",
      county: "Montserrado",
      country: "Liberia",
      lat: 6.3006,
      lng: -10.7969,
    },
    hours: [
      { day: "MON", open: true, openTime: "08:00", closeTime: "18:00" },
      { day: "TUE", open: true, openTime: "08:00", closeTime: "18:00" },
      { day: "WED", open: true, openTime: "08:00", closeTime: "18:00" },
      { day: "THU", open: true, openTime: "08:00", closeTime: "18:00" },
      { day: "FRI", open: true, openTime: "08:00", closeTime: "18:00" },
      { day: "SAT", open: true, openTime: "09:00", closeTime: "15:00" },
      { day: "SUN", open: false },
    ],
    photos: ["/mock/shop-exterior.jpg", "/mock/shop-interior.jpg"],
    shopEnabled: true,
    status: "ACTIVE",
    itemCount: 34,
  },
  {
    id: "loc-002",
    name: "Sinkor Branch",
    category: "HARDWARE_STORE",
    description:
      "Sinkor neighbourhood branch — same selection, smaller footprint.",
    email: "sinkor@monroviahardware.lr",
    phone: "+231770654321",
    contactPerson: "Mary Pewu",
    contactEmail: "mary@monroviahardware.lr",
    contactPhone: "+231770654321",
    address: {
      line1: "22 Tubman Boulevard",
      city: "Monrovia",
      county: "Montserrado",
      country: "Liberia",
    },
    hours: [
      { day: "MON", open: true, openTime: "09:00", closeTime: "17:00" },
      { day: "TUE", open: true, openTime: "09:00", closeTime: "17:00" },
      { day: "WED", open: true, openTime: "09:00", closeTime: "17:00" },
      { day: "THU", open: true, openTime: "09:00", closeTime: "17:00" },
      { day: "FRI", open: true, openTime: "09:00", closeTime: "17:00" },
      { day: "SAT", open: false },
      { day: "SUN", open: false },
    ],
    photos: ["/mock/shop-exterior.jpg"],
    shopEnabled: true,
    status: "ACTIVE",
    itemCount: 18,
  },
];

// ─── Partner Profile ─────────────────────────────────────────────────────────

export const mockPartner: PartnerProfile = {
  id: "partner-001",
  businessName: "Monrovia Hardware & Supply",
  businessPhone: "+231770001234",
  businessType: "HARDWARE_STORE",
  email: "info@monroviahardware.lr",
  ownerName: "Emmanuel Kollie",
  role: "OWNER",
  status: "APPROVED",
  shopEnabled: true,
  setupProgress: {
    profileComplete: true,
    photosUploaded: true,
    catalogHasItems: true,
    payoutMethodSet: true,
    percentComplete: 100,
  },
  locations: mockLocations,
  activeLocationId: "loc-001",
  createdAt: "2026-02-15T10:00:00Z",
};

/**
 * Second partner fixture — invited but hasn't completed the onboarding wizard.
 * Phase 2 will gate the dashboard redirect on `setupProgress.profileComplete`.
 * Required fields are populated with placeholders (the type requires them);
 * Phase 2 may relax the type or add an explicit `onboardingComplete` flag.
 */
export const mockNonOnboardedPartner: PartnerProfile = {
  id: "partner-002",
  businessName: "",
  businessPhone: "+231770007777",
  businessType: "OTHER",
  email: "new@partner.lr",
  ownerName: "",
  role: "OWNER",
  status: "PENDING_REVIEW",
  shopEnabled: false,
  setupProgress: {
    profileComplete: false,
    photosUploaded: false,
    catalogHasItems: false,
    payoutMethodSet: false,
    percentComplete: 0,
  },
  locations: [],
  activeLocationId: "",
  createdAt: "2026-05-01T10:00:00Z",
};

// ─── Catalog ─────────────────────────────────────────────────────────────────

export const mockCategories: CatalogCategory[] = [
  { id: "cat-001", name: "Plumbing Supplies", itemCount: 12, displayOrder: 1 },
  { id: "cat-002", name: "Electrical", itemCount: 8, displayOrder: 2 },
  { id: "cat-003", name: "Paint & Finishing", itemCount: 6, displayOrder: 3 },
  { id: "cat-004", name: "Tools", itemCount: 5, displayOrder: 4 },
  { id: "cat-005", name: "Fasteners", itemCount: 3, displayOrder: 5 },
];

export const mockItems: CatalogItem[] = [
  {
    id: "item-001",
    name: "PVC Pipe - 1 inch (10ft)",
    description: "Standard schedule 40 PVC pipe, 10 foot length",
    categoryId: "cat-001",
    categoryName: "Plumbing Supplies",
    price: 350,
    stockQuantity: 24,
    stockStatus: "IN_STOCK",
    photos: ["/mock/pvc-pipe.jpg"],
    sku: "PLM-PVC-1IN",
    status: "ACTIVE",
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-04-10T09:00:00Z",
  },
  {
    id: "item-002",
    name: "PVC Pipe - 2 inch (10ft)",
    description: "Standard schedule 40 PVC pipe, 2 inch diameter",
    categoryId: "cat-001",
    categoryName: "Plumbing Supplies",
    price: 500,
    stockQuantity: 3,
    stockStatus: "LOW_STOCK",
    photos: ["/mock/pvc-pipe.jpg"],
    sku: "PLM-PVC-2IN",
    status: "ACTIVE",
    createdAt: "2026-03-01T08:00:00Z",
    updatedAt: "2026-04-15T11:00:00Z",
  },
  {
    id: "item-003",
    name: "Pipe Cement 250ml",
    description: "PVC solvent cement for pipe joints",
    categoryId: "cat-001",
    categoryName: "Plumbing Supplies",
    price: 800,
    stockQuantity: 0,
    stockStatus: "OUT_OF_STOCK",
    photos: ["/mock/cement.jpg"],
    status: "DISABLED",
    createdAt: "2026-03-05T08:00:00Z",
    updatedAt: "2026-04-20T14:00:00Z",
  },
  {
    id: "item-004",
    name: "Teflon Tape (3-pack)",
    categoryId: "cat-001",
    categoryName: "Plumbing Supplies",
    price: 150,
    stockQuantity: 40,
    stockStatus: "IN_STOCK",
    photos: ["/mock/teflon.jpg"],
    status: "ACTIVE",
    createdAt: "2026-03-10T08:00:00Z",
    updatedAt: "2026-04-01T09:00:00Z",
  },
  {
    id: "item-005",
    name: "Electrical Wire 2.5mm (50m roll)",
    description: "Single-core copper wire, red, 50 metre roll",
    categoryId: "cat-002",
    categoryName: "Electrical",
    price: 4500,
    stockQuantity: 8,
    stockStatus: "IN_STOCK",
    photos: ["/mock/wire.jpg"],
    sku: "ELC-WIRE-2.5",
    status: "ACTIVE",
    createdAt: "2026-03-12T08:00:00Z",
    updatedAt: "2026-04-05T10:00:00Z",
  },
  {
    id: "item-006",
    name: "White Emulsion Paint 4L",
    description: "Interior wall paint, bright white, water-based",
    categoryId: "cat-003",
    categoryName: "Paint & Finishing",
    price: 1200,
    stockQuantity: 15,
    stockStatus: "IN_STOCK",
    photos: ["/mock/paint.jpg"],
    status: "ACTIVE",
    createdAt: "2026-03-20T08:00:00Z",
    updatedAt: "2026-04-10T08:00:00Z",
  },
];

// ─── Orders ──────────────────────────────────────────────────────────────────

export const mockOrders: MaterialsOrder[] = [
  {
    id: "order-001",
    reference: "MAT-2026-0042",
    jobReference: "JOB-1234",
    jobType: "Plumbing Repair",
    contractor: {
      id: "c-001",
      name: "James K.",
      phone: "+231770005678",
      photoUrl: "/mock/contractor-1.jpg",
    },
    lineItems: [
      { id: "li-001", itemId: "item-001", itemName: "PVC Pipe - 1 inch (10ft)", quantity: 3, unitPrice: 350 },
      { id: "li-002", itemId: "item-003", itemName: "Pipe Cement 250ml", quantity: 1, unitPrice: 800 },
      { id: "li-003", itemId: "item-004", itemName: "Teflon Tape (3-pack)", quantity: 2, unitPrice: 150 },
    ],
    baseTotal: 2150,
    status: "FUNDED",
    statusHistory: [
      { status: "NEW", timestamp: "2026-04-21T09:00:00Z" },
      { status: "FUNDED", timestamp: "2026-04-21T09:45:00Z" },
    ],
    locationId: "loc-001",
    createdAt: "2026-04-21T09:00:00Z",
    updatedAt: "2026-04-21T09:45:00Z",
  },
  {
    id: "order-002",
    reference: "MAT-2026-0041",
    jobReference: "JOB-1231",
    jobType: "Electrical Wiring",
    contractor: {
      id: "c-002",
      name: "Moses T.",
      phone: "+231770009012",
    },
    lineItems: [
      { id: "li-004", itemId: "item-005", itemName: "Electrical Wire 2.5mm (50m roll)", quantity: 2, unitPrice: 4500 },
    ],
    baseTotal: 9000,
    status: "READY_FOR_PICKUP",
    statusHistory: [
      { status: "NEW", timestamp: "2026-04-20T10:00:00Z" },
      { status: "FUNDED", timestamp: "2026-04-20T10:30:00Z" },
      { status: "CONFIRMED", timestamp: "2026-04-20T11:00:00Z" },
      { status: "PREPARING", timestamp: "2026-04-20T14:00:00Z" },
      { status: "READY_FOR_PICKUP", timestamp: "2026-04-21T08:00:00Z" },
    ],
    pickupCode: "A3K7F2",
    pickupCodeExpiresAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    locationId: "loc-001",
    createdAt: "2026-04-20T10:00:00Z",
    updatedAt: "2026-04-21T08:00:00Z",
  },
  {
    id: "order-003",
    reference: "MAT-2026-0040",
    jobReference: "JOB-1228",
    jobType: "Interior Painting",
    contractor: {
      id: "c-003",
      name: "Rebecca M.",
      phone: "+231770007890",
    },
    lineItems: [
      { id: "li-005", itemId: "item-006", itemName: "White Emulsion Paint 4L", quantity: 4, unitPrice: 1200 },
    ],
    baseTotal: 4800,
    status: "PICKED_UP",
    statusHistory: [
      { status: "NEW", timestamp: "2026-04-19T09:00:00Z" },
      { status: "FUNDED", timestamp: "2026-04-19T09:30:00Z" },
      { status: "CONFIRMED", timestamp: "2026-04-19T10:00:00Z" },
      { status: "PREPARING", timestamp: "2026-04-19T13:00:00Z" },
      { status: "READY_FOR_PICKUP", timestamp: "2026-04-20T08:00:00Z" },
      { status: "PICKED_UP", timestamp: "2026-04-20T09:15:00Z" },
    ],
    locationId: "loc-001",
    createdAt: "2026-04-19T09:00:00Z",
    updatedAt: "2026-04-20T09:15:00Z",
  },
  {
    id: "order-004",
    reference: "MAT-2026-0039",
    jobReference: "JOB-1220",
    jobType: "Plumbing Repair",
    contractor: {
      id: "c-001",
      name: "James K.",
      phone: "+231770005678",
    },
    lineItems: [
      { id: "li-006", itemId: "item-002", itemName: "PVC Pipe - 2 inch (10ft)", quantity: 2, unitPrice: 500 },
    ],
    baseTotal: 1000,
    status: "RETURN_REQUESTED",
    statusHistory: [
      { status: "NEW", timestamp: "2026-04-18T09:00:00Z" },
      { status: "FUNDED", timestamp: "2026-04-18T09:30:00Z" },
      { status: "CONFIRMED", timestamp: "2026-04-18T10:00:00Z" },
      { status: "PREPARING", timestamp: "2026-04-18T13:00:00Z" },
      { status: "READY_FOR_PICKUP", timestamp: "2026-04-19T08:00:00Z" },
      { status: "PICKED_UP", timestamp: "2026-04-19T09:00:00Z" },
      { status: "RETURN_REQUESTED", timestamp: "2026-04-20T14:00:00Z" },
    ],
    returnRequest: {
      initiatedBy: "CONTRACTOR",
      reason: "Wrong size — needed 3 inch, received 2 inch",
      photoUrls: ["/mock/return-photo.jpg"],
      lineItems: [{ lineItemId: "li-006", quantity: 2 }],
      createdAt: "2026-04-20T14:00:00Z",
    },
    locationId: "loc-001",
    createdAt: "2026-04-18T09:00:00Z",
    updatedAt: "2026-04-20T14:00:00Z",
  },
];

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const mockWallet: WalletSummary = {
  availableBalance: 128050,
  pendingBalance: 24500,
  totalEarned: 1245000,
  currency: "USD",
};

export const mockTransactions: Transaction[] = [
  {
    id: "tx-001",
    type: "EARNING",
    description: "Order MAT-2026-0040 — Pickup confirmed",
    amount: 4800,
    runningBalance: 128050,
    currency: "USD",
    orderId: "order-003",
    createdAt: "2026-04-20T09:15:00Z",
  },
  {
    id: "tx-002",
    type: "WITHDRAWAL",
    description: "Withdrawal to MTN MoMo ×1234",
    amount: -50000,
    runningBalance: 123250,
    currency: "USD",
    createdAt: "2026-04-18T14:00:00Z",
  },
  {
    id: "tx-003",
    type: "EARNING",
    description: "Order MAT-2026-0038 — Pickup confirmed",
    amount: 12300,
    runningBalance: 173250,
    currency: "USD",
    orderId: "order-038",
    createdAt: "2026-04-17T10:30:00Z",
  },
];

export const mockPayoutMethods: PayoutMethod[] = [
  {
    type: "MOBILE_MONEY",
    id: "pm-001",
    label: "MTN MoMo",
    provider: "MTN Liberia",
    phoneNumber: "+231770001234",
    isDefault: true,
  },
];

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const mockReviews: Review[] = [
  {
    id: "rev-001",
    rating: 5,
    reviewerName: "James K.",
    orderReference: "MAT-2026-0042",
    comment: "Got my plumbing parts fast. Pickup was easy and Emmanuel was helpful.",
    createdAt: "2026-04-21T11:00:00Z",
    reply: {
      text: "Thanks James — glad we could get you in and out quickly!",
      createdAt: "2026-04-21T13:30:00Z",
    },
  },
  {
    id: "rev-002",
    rating: 4,
    reviewerName: "Moses T.",
    orderReference: "MAT-2026-0041",
    comment: "Good wire stock — the shop was a bit tricky to find behind the church.",
    createdAt: "2026-04-19T15:00:00Z",
  },
  {
    id: "rev-003",
    rating: 5,
    reviewerName: "Rebecca M.",
    orderReference: "MAT-2026-0040",
    comment: "Exactly the paint I needed and the price was fair. Will come back.",
    createdAt: "2026-04-18T09:30:00Z",
    reply: {
      text: "Thank you Rebecca! See you next time.",
      createdAt: "2026-04-18T11:00:00Z",
    },
  },
  {
    id: "rev-004",
    rating: 3,
    reviewerName: "Sarah W.",
    orderReference: "MAT-2026-0037",
    comment: "Order was fine but ready-for-pickup notice came later than promised.",
    createdAt: "2026-04-17T14:15:00Z",
  },
  {
    id: "rev-005",
    rating: 5,
    reviewerName: "John D.",
    orderReference: "MAT-2026-0035",
    comment: "Best hardware shop in Sinkor. The cement was fresh.",
    createdAt: "2026-04-16T10:00:00Z",
    reply: {
      text: "Appreciate it John — we restock cement weekly.",
      createdAt: "2026-04-16T12:30:00Z",
    },
  },
  {
    id: "rev-006",
    rating: 2,
    reviewerName: "Patience G.",
    orderReference: "MAT-2026-0033",
    comment: "PVC fittings were the wrong size despite my order saying 2 inch. Took two trips to sort out.",
    createdAt: "2026-04-15T16:45:00Z",
  },
  {
    id: "rev-007",
    rating: 4,
    reviewerName: "Emmanuel B.",
    orderReference: "MAT-2026-0030",
    comment: "Solid selection. Staff knew their stock and could recommend alternatives.",
    createdAt: "2026-04-14T11:20:00Z",
  },
  {
    id: "rev-008",
    rating: 5,
    reviewerName: "David K.",
    orderReference: "MAT-2026-0028",
    comment: "Picked up a full plumbing kit in 10 minutes flat. Top service.",
    createdAt: "2026-04-13T08:50:00Z",
  },
  {
    id: "rev-009",
    rating: 1,
    reviewerName: "Faith N.",
    orderReference: "MAT-2026-0026",
    comment: "Order was marked picked up before I even got there. Lost half the items.",
    createdAt: "2026-04-12T17:00:00Z",
  },
  {
    id: "rev-010",
    rating: 4,
    reviewerName: "Joseph T.",
    orderReference: "MAT-2026-0023",
    comment: "Decent prices on electrical wire. Storefront could use better signage.",
    createdAt: "2026-04-11T13:10:00Z",
  },
  {
    id: "rev-011",
    rating: 5,
    reviewerName: "Mary S.",
    orderReference: "MAT-2026-0019",
    comment: "Friendly counter staff and the contractor app pickup code worked first try.",
    createdAt: "2026-04-10T09:25:00Z",
  },
  {
    id: "rev-012",
    rating: 3,
    reviewerName: "Princess H.",
    orderReference: "MAT-2026-0015",
    comment: "Stock was good but the wait at the counter was long during lunch hour.",
    createdAt: "2026-04-09T12:40:00Z",
  },
];

// ─── Settings ─────────────────────────────────────────────────────────────────

export const mockSettingsGeneral: SettingsGeneral = {
  displayName: "Monrovia Hardware & Supply",
  language: "en",
  timezone: "Africa/Monrovia",
  defaultCurrency: "USD",
};

export const mockTeam: TeamMember[] = [
  {
    id: "tm-001",
    name: "Emmanuel Kollie",
    email: "info@monroviahardware.lr",
    role: "OWNER",
    status: "ACTIVE",
    lastActiveAt: "2026-05-06T17:30:00Z",
  },
  {
    id: "tm-002",
    name: "Princess Hayes",
    email: "princess@monroviahardware.lr",
    role: "MANAGER",
    status: "ACTIVE",
    lastActiveAt: "2026-05-04T09:10:00Z",
  },
];

/**
 * Per-invitation tokens issued by `POST /api/v1/settings/team/invitations`.
 * Persisted alongside `mockTeam` so that `/auth/partner/invite/accept`
 * can later be wired to validate the token (out of scope for PR-9B —
 * see Risks #5 in phase-9-settings.md).
 */
export const mockInvitations: Invitation[] = [];

export const mockNotificationPrefs: NotificationPrefs = {
  email: { orderUpdates: true, payoutAlerts: true, reviews: false },
  sms: { pickupReminders: true, returnRequests: true },
};
