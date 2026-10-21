import { test as base, expect } from '@playwright/test';

// Client public variables can already be embedded in the production build.
// Block all external browser traffic rather than relying on runtime env overrides.
export const test = base.extend<{ isolateBrowserNetwork: void }>({
  isolateBrowserNetwork: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin || !['http:', 'https:'].includes(url.protocol))
          await route.continue();
        else await route.abort('blockedbyclient');
      });
      await use();
    },
    { auto: true },
  ],
});
export { expect };
export type { Page, APIRequestContext } from '@playwright/test';
