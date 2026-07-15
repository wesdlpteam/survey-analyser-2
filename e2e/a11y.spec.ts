// Task 14 Step 3: axe scans (WCAG 2.2 AA) across every screen a user
// actually reaches without an AI key - landing, the three report tabs
// loaded via sample data, and the Settings drawer. Target is zero
// violations; a rule is only ever disabled per-scan with a comment
// explaining why it's a genuine false positive here, never app-wide.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  test('landing page', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('report - Audit tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute('aria-selected', 'true');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('report - Explore tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await page.getByRole('tab', { name: 'Explore' }).click();
    await expect(page.getByRole('tab', { name: 'Explore' })).toHaveAttribute('aria-selected', 'true');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('report - Ask tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await page.getByRole('tab', { name: 'Ask' }).click();
    await expect(page.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('Settings drawer open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
