import type { Page } from '@playwright/test';

import type { MockRpcCall } from '@/lib/e2e-seam';

/**
 * Shared Playwright helpers for end-to-end flow tests.
 *
 * - `useMockWallet` installs the mock wallet (an address, no keys) and the
 *   RPC recorder from src/lib/e2e-seam.ts. The app then behaves as if that
 *   wallet is connected and every contract call succeeds on mock chain.
 * - `mockBackend` serves the read API from in-memory fixtures. List queries
 *   return `vouchers` whatever the filter is; single-entity routes resolve
 *   from `provider` / `voucherById`.
 * - `mockInvokes` returns the recorded contract writes for assertions.
 */

declare global {
  interface Window {
    __SCI_MOCK_WALLET__?: { address: string };
    __SCI_MOCK_RPC__?: { calls: MockRpcCall[]; delayMs?: number };
  }
}

/**
 * `delayMs` keeps mocked writes in flight for that long, so a test can
 * observe the unload guard during a pending transaction.
 */
export async function useMockWallet(
  page: Page,
  address: string,
  delayMs = 0,
): Promise<void> {
  await page.addInitScript(
    `window.__SCI_MOCK_WALLET__ = { address: '${address}' };
     window.__SCI_MOCK_RPC__ = { calls: [], delayMs: ${delayMs} };`,
  );
  // The analytics script tag is present in the test build; keep the request
  // itself inside the sandbox. (The analytics spec stubs window.plausible,
  // which is unaffected by this.)
  await page.route('https://plausible.io/**', (route) => route.abort());
}

export type BackendState = {
  provider?: Record<string, unknown>;
  /** Several providers at once, e.g. for the map's located/unlocated split. */
  providers?: Record<string, unknown>[];
  vouchers?: Record<string, unknown>[];
  voucherById?: Record<string, unknown>;
};

export async function mockBackend(page: Page, state: BackendState): Promise<void> {
  const providers = state.providers ?? (state.provider ? [state.provider] : []);
  await page.route('http://localhost:8080/**', (route) => {
    const url = new URL(route.request().url());
    const parts = url.pathname.split('/').filter(Boolean);
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (parts[0] === 'stats') {
      return json({
        providers: providers.length,
        activeProviders: providers.length,
        vouchers: state.vouchers?.length ?? 0,
        settledVouchers: 0,
        settledValue: '0',
        receipts: 0,
      });
    }

    if (parts[0] === 'receipts') {
      return json({ total: 0, totalSpendDisplay: '0.00', receipts: [] });
    }

    if (parts[0] === 'providers') {
      if (parts.length === 2) {
        const found = providers.find(
          (p) => (p as { address?: string }).address === parts[1],
        );
        if (found) return json(found);
        return json({ message: 'Not found' }, 404);
      }
      return json({ total: providers.length, providers });
    }

    if (parts[0] === 'vouchers') {
      if (parts.length === 2) {
        const v = state.voucherById?.[parts[1]];
        if (v) return json(v);
        return json({ message: 'Not found' }, 404);
      }
      return json({ total: state.vouchers?.length ?? 0, vouchers: state.vouchers ?? [] });
    }

    return route.continue();
  });
}

/** Contract writes recorded by the RPC mock, in call order. */
export async function mockInvokes(page: Page): Promise<MockRpcCall[]> {
  const calls = await page.evaluate(() => window.__SCI_MOCK_RPC__?.calls ?? []);
  return calls.filter((c) => c.kind === 'invoke');
}
