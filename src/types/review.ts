/**
 * Review types — shared by the partner-facing Reviews list (PR-8A) and
 * the reply create/edit/delete flow (PR-8B).
 *
 * Ratings are integer 1–5; the literal-union keeps the distribution map
 * and any UI filter chips exhaustive.
 */

export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export interface ReviewReply {
  text: string;
  /** ISO timestamp the reply was first posted. */
  createdAt: string;
  /** ISO timestamp of the most recent edit (omitted until first edit). */
  updatedAt?: string;
}

export interface Review {
  id: string;
  rating: ReviewRating;
  reviewerName: string;
  /**
   * Optional avatar URL — mock data leaves this unset and the UI falls
   * through to initials. The real backend may populate from the
   * customer profile.
   */
  avatarUrl?: string;
  comment: string;
  createdAt: string;
  reply?: ReviewReply;
  /**
   * Order this review is about — rendered next to the reviewer name
   * on the row (e.g. "Order #MAT-2026-0040"). Optional so legacy
   * fixtures still type-check.
   */
  orderReference?: string;
}

export type RatingDistribution = Record<ReviewRating, number>;

export interface ReviewSummary {
  /** Average rating, rounded to one decimal place. `0` when total is 0. */
  average: number;
  total: number;
  distribution: RatingDistribution;
  /**
   * Percentage of reviews considered positive (4–5 stars), rounded
   * to the nearest integer. `0` when total is 0.
   */
  positiveRate: number;
  /**
   * Percentage of reviews where the partner posted a reply, rounded
   * to the nearest integer. `0` when total is 0.
   */
  responseRate: number;
  /** Count of un-replied reviews — drives the "Not replied" tab badge. */
  unrepliedCount: number;
}

/**
 * Sentiment buckets derived from `rating`:
 *   5–4 → positive · 3 → neutral · 1–2 → negative.
 *
 * Frontend-only convenience type; the API never sends `Sentiment`
 * directly — it's computed from `rating` per row.
 */
export type Sentiment = "positive" | "neutral" | "negative";

export function ratingToSentiment(rating: ReviewRating): Sentiment {
  if (rating >= 4) return "positive";
  if (rating === 3) return "neutral";
  return "negative";
}

/** Filters supported by `GET /api/v1/reviews?filter=`. */
export type ReviewFilter =
  | "all"
  | "positive"
  | "neutral"
  | "negative"
  | "not-replied";

/** Sort orders supported by `GET /api/v1/reviews?sort=`. */
export type ReviewSort = "recent" | "highest" | "lowest";

/** Server response shape for `GET /api/v1/reviews`. */
export interface ReviewListResponse {
  items: Review[];
  summary: ReviewSummary;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Hard cap on reply length. The UI sets `maxLength` on the textarea +
 * shows a `n/2000` counter; the server rejects anything longer with
 * `INVALID_REPLY_LENGTH`. Lives here so both sides import the same
 * value.
 */
export const MAX_REPLY_LENGTH = 2000;
