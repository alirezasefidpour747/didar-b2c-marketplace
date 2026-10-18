export const HEADER: string;
export const MAX_AGE_MS: number;
export function normalizePeer(value: string): string;
export function requireKey(key: unknown): string;
export type NetworkProof = { v: 1; peer: string; ts: number; nonce: string };
export type NetworkInput = {
  key: string | undefined;
  method: string;
  path: string;
  body: Uint8Array | string;
};
export function signNetwork(
  input: NetworkInput & { peer: string; ts?: number; nonce?: string },
): string;
export function verifyNetwork(
  input: NetworkInput & { assertion: string | null | undefined; now?: number },
): NetworkProof;
