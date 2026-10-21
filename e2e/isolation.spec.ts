import { test, expect } from './fixtures';

test('browser cannot send analytics or any other external network requests', async ({ page }) => {
  await page.goto('/');
  const sent = await page.evaluate(async () => {
    try {
      await fetch('https://us.i.posthog.com/i/v0/e/', {
        method: 'POST',
        body: 'synthetic-isolation-check',
      });
      return true;
    } catch {
      return false;
    }
  });
  expect(sent).toBe(false);
  await expect(page.getByTestId('login-submit-button')).toBeVisible();
});
