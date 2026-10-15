import { expect, test } from "bun:test";
import { isAvailable, reservationStatus } from "../packages/api/src/didar/inventory";

test("exact grouped stock permits the last piece but never an oversell", () => {
  expect(isAvailable(0, 1)).toBe(false);
  expect(isAvailable(1, 1)).toBe(true);
  expect(isAvailable(1, 2)).toBe(false);
  expect(isAvailable(100, 100)).toBe(true);
});

test("fractional, unsafe and invalid stock requests cannot be reserved", () => {
  for (const available of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => isAvailable(available, 1)).toThrow();
  for (const requested of [0, -1, 0.5, 101, NaN, Infinity])
    expect(() => isAvailable(5, requested)).toThrow();
});

test("only pending reservations expire, including the exact expiry boundary", () => {
  const expires = new Date("2026-10-15T12:00:00Z");
  expect(reservationStatus("pending", expires, new Date("2026-10-15T11:59:59Z"))).toBe("pending");
  expect(reservationStatus("pending", expires, expires)).toBe("expired");
  for (const terminal of ["paid", "failed", "expired"] as const)
    expect(reservationStatus(terminal, expires, new Date("2026-10-16T12:00:00Z"))).toBe(terminal);
});
