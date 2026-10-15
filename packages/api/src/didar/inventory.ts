import { integer } from "./pricing";
/** Quantities represent currently available pieces; pending reservations are already deducted. */
export function isAvailable(available: number, requested: number): boolean {
  integer(available, "AVAILABLE", 0, Number.MAX_SAFE_INTEGER);
  integer(requested, "QUANTITY", 1, 100);
  return available >= requested;
}
export function reservationStatus(
  status: "pending" | "paid" | "failed" | "expired",
  expiresAt: Date,
  now: Date,
): "pending" | "paid" | "failed" | "expired" {
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(now.getTime()))
    throw new Error("INVALID_EXPIRY");
  return status === "pending" && expiresAt <= now ? "expired" : status;
}
