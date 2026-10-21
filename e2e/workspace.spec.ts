import { test, expect, type Page } from './fixtures';
async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill('Trial2026!');
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByTestId('login-email-input')).toBeVisible();
}
test('agency publishes, nurse claims and cancels, expired nurse is blocked', async ({ page }) => {
  await signIn(page, 'admin@sunrisehealth.example');
  await page.getByTestId('agency-post-shift-button').click();
  await page.getByLabel('Shift date', { exact: true }).fill('2026-11-06');
  await page.getByLabel('Start time', { exact: true }).fill('19:00');
  await page.getByLabel('End time', { exact: true }).fill('07:00');
  await page.getByTestId('agency-post-shift-submit-button').click();
  await expect(page.getByTestId('notification-banner')).toContainText('Shift published');
  await signOut(page);
  await signIn(page, 'james.cook@example.com');
  await page.getByLabel('Search shifts').fill('2026-11-06');
  await page.getByTestId('shift-claim-button').first().click();
  await expect(page.getByTestId('notification-banner')).toContainText(
    'Credential expired, cannot claim shift',
  );
  await signOut(page);
  await signIn(page, 'maria.lopez@example.com');
  await page.getByLabel('Search shifts').fill('2026-11-06');
  await page.getByTestId('shift-claim-button').first().click();
  await expect(page.getByTestId('notification-banner')).toContainText('Shift claimed');
  await page.getByTestId('shift-cancel-button').first().click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByTestId('notification-banner')).toContainText('Shift reopened');
  await expect(page.getByTestId('shift-claim-button').first()).toBeVisible();
});
test('actual hours can be submitted by nurse and approved by agency', async ({ page }) => {
  await signIn(page, 'maria.lopez@example.com');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(page.getByTestId('timesheet-table')).toBeVisible();
  await page.getByRole('button', { name: 'Record hours', exact: true }).click();
  await page.getByLabel('Unpaid break (minutes)').fill('30');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByTestId('notification-banner')).toContainText('draft saved');
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click();
  await expect(page.getByTestId('notification-banner')).toContainText('submitted');
  await signOut(page);
  await signIn(page, 'admin@sunrisehealth.example');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  await expect(page.getByTestId('notification-banner')).toContainText('approved');
  await expect(page.getByTestId('timesheet-table')).toContainText('11h 30m');
});
test('admin report, audit, downloads and credential inputs are accessible', async ({
  page,
  request,
}) => {
  const agencyLogin = await request.post('/api/auth/login', {
    data: { email: 'admin@sunrisehealth.example', password: 'Trial2026!' },
  });
  const { token } = await agencyLogin.json();
  expect(
    (
      await request.post('/api/shifts', {
        headers: { Authorization: `Bearer ${token}` },
        data: { role: 'RN', date: '2026-10-07', startTime: '07:00', endTime: '19:00' },
      })
    ).status(),
  ).toBe(201);
  await signIn(page, 'maria.lopez@example.com');
  await page.getByRole('button', { name: 'Credentials', exact: true }).click();
  await expect(page.getByTestId('credential-upload-input')).toBeVisible();
  await expect(page.getByTestId('credential-expiry-date-input')).toBeVisible();
  await expect(page.getByText('Verified demo record', { exact: false })).toBeVisible();
  await signOut(page);
  await signIn(page, 'alex.kim@example.com');
  await expect(page.getByTestId('admin-dashboard-shift-table')).toBeVisible();
  await expect(page.getByTestId('admin-shift-status-badge').first()).toBeVisible();
  await page.getByRole('button', { name: 'Audit trail', exact: true }).click();
  await expect(page.getByTestId('audit-log-table')).toBeVisible();
  await expect(page.getByTestId('audit-log-table')).toContainText('shift / posted');
  await page.getByRole('button', { name: 'Credentials', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export documents' }).click();
  expect((await download).suggestedFilename()).toBe('shiftpatch-documents.zip');
});
test('mobile navigation and layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('login-email-input').fill('maria.lopez@example.com');
  await page.getByTestId('login-password-input').fill('Trial2026!');
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByRole('heading', { name: 'Shift marketplace' })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'My shifts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My shifts' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('rejected hours can be corrected, resubmitted and reflected in filtered reports', async ({
  page,
  request,
}) => {
  async function token(email: string) {
    const response = await request.post('/api/auth/login', {
      data: { email, password: 'Trial2026!' },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).token as string;
  }
  const agencyToken = await token('admin@sunrisehealth.example');
  const nurseToken = await token('maria.lopez@example.com');
  const headers = { Authorization: `Bearer ${agencyToken}` };
  const nurseHeaders = { Authorization: `Bearer ${nurseToken}` };
  await page.context().clearCookies();
  const created = await request.post('/api/shifts', {
    headers,
    data: { role: 'RN', date: '2026-11-20', startTime: '19:00', endTime: '07:00' },
  });
  expect(created.status()).toBe(201);
  const shift = await created.json();
  expect(
    (await request.post(`/api/shifts/${shift.id}/claim`, { headers: nurseHeaders })).status(),
  ).toBe(200);
  await signIn(page, 'maria.lopez@example.com');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByRole('button', { name: 'Record hours', exact: true }).click();
  const assignments = await request.get('/api/assignments', { headers: nurseHeaders });
  const assignment = (await assignments.json()).assignments.find(
    (a: { shiftId: string }) => a.shiftId === shift.id,
  );
  await page.getByRole('dialog').getByRole('combobox').selectOption(assignment.id);
  await page.getByLabel('Actual end', { exact: true }).fill('2026-11-22T07:00');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Timesheet must span');
  await page.getByLabel('Actual end', { exact: true }).fill('2026-11-21T07:00');
  await page.getByLabel('Unpaid break (minutes)').fill('30');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: shift.id });
  await row.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(row).toContainText('Submitted');
  await signOut(page);
  await signIn(page, 'admin@sunrisehealth.example');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  const submitted = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Reject', exact: true }) });
  await submitted.getByRole('button', { name: 'Reject', exact: true }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Please include the full one-hour break.');
  await page.getByRole('button', { name: 'Return timesheet', exact: true }).click();
  await expect(page.getByTestId('notification-banner')).toContainText('returned');
  await signOut(page);
  await signIn(page, 'maria.lopez@example.com');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await expect(row).toContainText('Please include the full one-hour break.');
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Unpaid break (minutes)').fill('60');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(row).toContainText('11h 0m');
  await row.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(row).toContainText('Submitted');
  await signOut(page);
  await signIn(page, 'admin@sunrisehealth.example');
  await page.getByRole('button', { name: 'Timesheets', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByTestId('notification-banner')).toContainText('approved');

  const reopened = await request.post('/api/shifts', {
    headers,
    data: { role: 'LPN', date: '2026-11-20', startTime: '07:00', endTime: '19:00' },
  });
  const second = await reopened.json();
  expect(
    (await request.post(`/api/shifts/${second.id}/claim`, { headers: nurseHeaders })).status(),
  ).toBe(200);
  expect(
    (
      await request.post(`/api/shifts/${second.id}/cancel`, {
        headers,
        data: { reason: 'no-show' },
      })
    ).status(),
  ).toBe(200);
  await signOut(page);
  await signIn(page, 'alex.kim@example.com');
  await page.getByRole('combobox', { name: /^Agency/ }).selectOption('agency-a');
  await page.getByLabel('From date', { exact: true }).fill('2026-11-20');
  await page.getByLabel('To date', { exact: true }).fill('2026-11-20');
  await expect(page.getByTestId('admin-dashboard-shift-table').locator('tbody tr')).toHaveCount(2);
  const adminToken = await token('alex.kim@example.com');
  const query = 'agencyId=agency-a&from=2026-11-20&to=2026-11-20';
  const report = await request.get(`/api/admin/report?${query}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(await report.json()).toMatchObject({
    open: 1,
    filled: 1,
    cancellations: 1,
    noShows: 1,
    approvedMinutes: 660,
    coverageRate: 50,
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('shiftpatch-report.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString();
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).toContain(shift.id);
  expect(csv).toContain(second.id);
  expect(csv).not.toContain('Metro Care Partners');
  await page.getByRole('combobox', { name: /^Agency/ }).selectOption('agency-b');
  await expect(page.getByTestId('admin-dashboard-shift-table').locator('tbody tr')).toHaveCount(0);
});
