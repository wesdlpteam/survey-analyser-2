// Task 14 Step 2: the core "load sample data -> read the report -> export"
// journey, end to end in a real browser. Deliberately never touches Settings
// or the AI key - sample data drives the same rule-based fallback audit
// every unit test exercises (loadSample() in appStore.ts), so this suite
// needs no network and no secret, and stays deterministic in CI.
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

test('sample survey renders a report, Explore charts, finding evidence, and a clean export', async ({ page }) => {
  // Settle animations (KpiTiles count-up, wsa-rise entrance fades) so
  // assertions read steady-state values. Must be emulateMedia, not the
  // config's context-level reducedMotion option - that option is a silent
  // no-op in this Playwright/Chromium combo (see a11y.spec.ts's beforeEach).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await page.getByRole('button', { name: 'Try with sample data' }).click();

  // Report rendered: tablist present, Audit tab selected by default.
  await expect(page.getByRole('tablist', { name: 'Report sections' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute('aria-selected', 'true');

  // Respondent count visible on the cover.
  const respondentsStat = page.locator('.audit-tab__cover-stat').filter({ hasText: 'Respondents' });
  await expect(respondentsStat.locator('dd')).toHaveText(/^\d+$/);

  // Tab to Explore: charts present.
  await page.getByRole('tab', { name: 'Explore' }).click();
  await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('img', { name: /^Bar chart:/ }).first()).toBeVisible();

  // Back to Audit: open a finding's <details>, evidence appears.
  await page.getByRole('tab', { name: 'Audit' }).click();
  const firstFinding = page.locator('details.finding-row').first();
  await firstFinding.locator('summary').click();
  await expect(firstFinding).toHaveJSProperty('open', true);
  await expect(firstFinding.locator('.finding-row__body')).toBeVisible();

  // Export: downloads a self-contained HTML file with the exec summary,
  // no leaked API-key storage reference, and no <script> (exportHtml.ts's
  // whole reason for existing - see its file header).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export report' }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const content = fs.readFileSync(downloadPath as string, 'utf-8');
  expect(content).toContain('Executive summary');
  expect(content).not.toContain('wsa2:key');
  expect(content.toLowerCase()).not.toContain('<script');
});
