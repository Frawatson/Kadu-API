/**
 * Wallet and payout types.
 *
 * IMPORTANT: All monetary values are integer minor-units (e.g. cents
 * for USD/LRD, whole units for JPY). Each money-bearing payload also
 * carries an ISO-4217 `currency` code so the formatter can pick the
 * right glyph + decimal precision (W7.1 / closes audit L4).
 */

export type TransactionType = "EARNING" | "WITHDRAWAL" | "REFUND_DEBIT";

export type PayoutMethodType = "MOBILE_MONEY" | "BANK_TRANSFER";

export type WithdrawalStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface WalletSummary {
  /** Ready-to-withdraw balance in minor units. */
  availableBalance: number;
  /** Tied to in-progress orders — not yet withdrawable. */
  pendingBalance: number;
  /** All-time total earned in minor units. */
  totalEarned: number;
  /** ISO-4217 currency code (e.g. "USD", "LRD"). */
  currency: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  /** Positive = credit, negative = debit (minor units). */
  amount: number;
  runningBalance: number;
  /** ISO-4217 currency code. */
  currency: string;
  orderId?: string;
  createdAt: string;
}

export interface MobileMoneyMethod {
  type: "MOBILE_MONEY";
  id: string;
  label: string;
  provider: string; // e.g. "MTN Liberia"
  phoneNumber: string;
  isDefault: boolean;
}

export interface BankTransferMethod {
  type: "BANK_TRANSFER";
  id: string;
  label: string;
  bankName: string;
  accountNumber: string; // masked: "****7890"
  accountHolderName: string;
  isDefault: boolean;
}

export type PayoutMethod = MobileMoneyMethod | BankTransferMethod;

export interface WithdrawalRecord {
  id: string;
  amount: number;
  fee: number;
  netAmount: number;
  /** ISO-4217 currency code. */
  currency: string;
  payoutMethod: PayoutMethod;
  status: WithdrawalStatus;
  reference: string;
  createdAt: string;
  completedAt?: string;
}
