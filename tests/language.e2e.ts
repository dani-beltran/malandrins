import { test, expect } from '@playwright/test';
import { ca, en } from '../src/data/locales';
import { freshSave, SaveStore } from '../src/systems/SaveStore';

for (const { path, language, savedLanguage } of [
  { path: '/ca', language: 'ca' },
  { path: '/en', language: 'en' },
  { path: '/ca/?campaign=summer#menu', language: 'ca', savedLanguage: 'en' },
  { path: '/en/?campaign=summer#menu', language: 'en', savedLanguage: 'ca' },
] as const) {
  test(`URL ${path} loads ${language}${savedLanguage ? ` over saved ${savedLanguage}` : ' for a new player'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (savedLanguage) {
      await page.addInitScript(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), {
        key: SaveStore.key,
        save: { ...freshSave(), language: savedLanguage, stage: 2, tapes: [1], started: true },
      });
    }
    await page.goto(path);
    const play = page.locator('[data-action="play"]');
    await expect(play).toBeVisible({ timeout: 45000 });
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(play).toContainText({ ca, en }[language][savedLanguage ? 'continue' : 'play']);
    await expect(
      page.locator(`[data-action="language"][data-value="${language}"]`),
    ).toHaveAttribute('aria-pressed', 'true');
    await play.click();
    await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-action="resume"]')).toBeVisible();
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      SaveStore.key,
    );
    expect(saved.language).toBe(language);
    if (savedLanguage) {
      expect(saved.stage).toBe(2);
      expect(saved.tapes).toEqual([1]);
    }
    expect(errors).toEqual([]);
  });
}

test('switching a localized URL preserves query and hash, and survives reload', async ({
  page,
}) => {
  await page.goto('/ca/?campaign=summer#menu');
  await expect(page.locator('[data-action="play"]')).toBeVisible({ timeout: 45000 });
  await page.locator('[data-action="language"][data-value="en"]').click();
  await expect(page).toHaveURL(/\/en\/\?campaign=summer#menu$/);
  await expect(page.locator('[data-action="play"]')).toContainText(en.play);
  await page.reload();
  await expect(page.locator('[data-action="play"]')).toContainText(en.play, { timeout: 45000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('[data-action="language"][data-value="ca"]').click();
  await expect(page).toHaveURL(/\/ca\/\?campaign=summer#menu$/);
  await expect(page.locator('[data-action="play"]')).toContainText(ca.play);
});

for (const path of ['/', '/es']) {
  test(`${path} falls back to English or the saved preference`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-action="play"]')).toContainText(en.play, { timeout: 45000 });
    await page.locator('[data-action="language"][data-value="ca"]').click();
    expect(new URL(page.url()).pathname).toBe(path);
    await page.reload();
    await expect(page.locator('[data-action="play"]')).toContainText(ca.play, { timeout: 45000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  });
}
