/**
 * Test-only seam for Playwright end-to-end tests.
 *
 * When the page sets `window.__SCI_MOCK_WALLET__` (an address, no keys) the
 * wallet provider reports that address and its signer echoes the unsigned
 * transaction back. When `window.__SCI_MOCK_RPC__` is present, contract
 * reads and writes short-circuit: calls are recorded for assertions and
 * canned `{ hash, returnValue }` values are returned without touching
 * Soroban RPC.
 *
 * Neither global is ever set outside tests, so production behaviour is
 * unchanged. The mock holds no secret keys and cannot move real funds: with
 * no RPC mock in place the echoed (unsigned) transaction would simply be
 * rejected by the network.
 */

export type MockRpcCall = {
  kind: 'invoke' | 'read';
  contractId: string;
  method: string;
};

declare global {
  interface Window {
    __SCI_MOCK_WALLET__?: { address: string };
    __SCI_MOCK_RPC__?: { calls: MockRpcCall[]; delayMs?: number };
  }
}

/** Address injected by Playwright, or null in normal use. */
export function mockWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__SCI_MOCK_WALLET__?.address ?? null;
}

/** True once Playwright has installed the RPC mock for this page. */
export function isMockRpc(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__SCI_MOCK_RPC__);
}

export function recordMockCall(call: MockRpcCall): void {
  window.__SCI_MOCK_RPC__?.calls.push(call);
}

/**
 * How long a mock write should stay in flight, in milliseconds. Lets a test
 * hold a transaction pending long enough to observe the unload guard.
 */
export function mockRpcDelayMs(): number {
  if (typeof window === 'undefined') return 0;
  const delay = window.__SCI_MOCK_RPC__?.delayMs ?? 0;
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}
