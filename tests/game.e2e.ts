import { test, expect, type Page } from '@playwright/test';
import { MapAdapter } from '../src/world/MapAdapter';
const saveKey = 'malandrins.save.v1';
interface Diagnostics {
  screen: string;
  player: { x: number; z: number };
  cameraYaw: number;
  vehicle: { id: number; speed: number } | null;
  npcs: { id: string; position: { x: number; z: number } }[];
  cars: { id: number; position: { x: number; z: number }; heading: number }[];
  tapes: { id: number; position: { x: number; z: number }; collected: boolean }[];
  stage: number;
  buildings: number;
}
async function diagnostics(page: Page): Promise<Diagnostics> {
  return page.evaluate(() =>
    (window as unknown as { malandrins: { inspect: () => Diagnostics } }).malandrins.inspect(),
  );
}
async function boot(page: Page) {
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem('malandrins.testSpawn');
    if (fixture) {
      const data = JSON.parse(localStorage.getItem('malandrins.save.v1')!);
      if (data) {
        data.position = JSON.parse(fixture);
        localStorage.setItem('malandrins.save.v1', JSON.stringify(data));
      }
      sessionStorage.removeItem('malandrins.testSpawn');
    }
  });
  await page.goto('/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 45000 });
}
async function start(page: Page) {
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#hud')).toBeVisible();
}
async function walkTo(page: Page, target: { x: number; z: number }, radius = 3.4) {
  for (let i = 0; i < 50; i++) {
    const { player, cameraYaw } = await diagnostics(page),
      dx = target.x - player.x,
      dz = target.z - player.z,
      d = Math.hypot(dx, dz);
    if (d < radius) return;
    const f = -Math.sin(cameraYaw) * dx - Math.cos(cameraYaw) * dz,
      r = Math.cos(cameraYaw) * dx - Math.sin(cameraYaw) * dz;
    const keys: string[] = [];
    if (Math.abs(f) > d * 0.26) keys.push(f > 0 ? 'w' : 's');
    if (Math.abs(r) > d * 0.26) keys.push(r > 0 ? 'd' : 'a');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(Math.min(350, Math.max(90, (d - radius) * 100)));
    for (const k of keys) await page.keyboard.up(k);
  }
  const state = await diagnostics(page);
  throw Error(`Could not walk from ${JSON.stringify(state.player)} to ${JSON.stringify(target)}`);
}
async function finishDialogue(page: Page) {
  await page.locator('#dialogue').waitFor({ state: 'visible' });
  for (let i = 0; i < 5 && (await page.locator('#dialogue').isVisible()); i++) {
    await page.locator('[data-action="dialogue"]').click();
    await page.waitForTimeout(80);
  }
}
async function loadPosition(page: Page, p: { x: number; z: number }) {
  await page.keyboard.press('Escape');
  await page.evaluate(
    (position) => sessionStorage.setItem('malandrins.testSpawn', JSON.stringify(position)),
    p,
  );
  await page.reload();
  await page.locator('[data-action="play"]').waitFor();
  await start(page);
}
test('WebGL town, walking, portrait dialogue, pause, map and Catalan settings', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await expect(page.getByRole('heading', { name: 'MALANDRINS.' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/title-screen.png' });
  await start(page);
  const state = await diagnostics(page);
  expect(state.buildings).toBeGreaterThan(130);
  await walkTo(page, state.npcs.find((n) => n.id === 'marcos')!.position);
  await expect(page.locator('#interaction')).toContainText('Marcos');
  await page.keyboard.press('e');
  await expect(page.locator('#dialogue')).toBeVisible();
  await expect(page.locator('#dialogue img')).toHaveAttribute('alt', 'Marcos');
  expect(
    await page.locator('#dialogue img').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/dialogue.png' });
  await finishDialogue(page);
  expect((await diagnostics(page)).stage).toBe(1);
  await expect(page.locator('#objective-text')).toContainText('Castor');
  await page.keyboard.press('m');
  await expect(page.locator('#large-map')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/town-map.png' });
  await page.keyboard.press('m');
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('[data-action="settings"]').click();
  await page.locator('.settings-panel [data-action="language"][data-value="ca"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await page.locator('#quality-select').selectOption('clear');
  await page.locator('#volume').fill('0.25');
  await page.locator('#volume').dispatchEvent('change');
  await page.locator('.settings-panel [data-action="audio"]').click();
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="resume"]').click();
  await expect(page.locator('#objective-text')).toContainText('Busca Castor');
  await page.keyboard.press('Escape');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), saveKey);
  expect(saved.stage).toBe(1);
  expect(saved.language).toBe('ca');
  expect(saved.volume).toBe(0.25);
  expect(saved.quality).toBe('clear');
  await page.reload();
  await page.locator('[data-action="play"]').waitFor();
  await expect(page.locator('[data-action="play"]')).toContainText('Continua');
  await start(page);
  await expect(page.locator('#objective-text')).toContainText('Castor');
  expect(errors).toEqual([]);
});
test('all five favours complete, tape reward persists, new night resets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await start(page);
  const contacts = ['marcos', 'castor', 'laila', 'marina', 'marcos'];
  for (let stage = 0; stage < contacts.length; stage++) {
    const target = (await diagnostics(page)).npcs.find((n) => n.id === contacts[stage])!.position;
    if (stage === 0) await walkTo(page, target);
    else await loadPosition(page, target);
    await page.keyboard.press('e');
    await expect(page.locator('#dialogue')).toBeVisible();
    await finishDialogue(page);
    expect((await diagnostics(page)).stage).toBe(stage + 1);
  }
  await expect(page.locator('#objective-text')).toContainText('festival is on');
  const tape = (await diagnostics(page)).tapes[3];
  await loadPosition(page, tape.position);
  await expect(page.locator('#interaction')).toContainText('tape');
  await page.keyboard.press('e');
  await expect.poll(async () => (await diagnostics(page)).tapes[3].collected).toBe(true);
  await expect(page.locator('.wallet')).toContainText('00550');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('[data-action="play"]').waitFor();
  await page.locator('[data-action="new"]').click();
  await page.locator('[data-action="reset"]').click();
  expect((await diagnostics(page)).stage).toBe(0);
  expect((await diagnostics(page)).tapes.every((t) => !t.collected)).toBe(true);
  expect(errors).toEqual([]);
});
test('enter a car, accelerate, brake and exit; small viewport remains usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page);
  await start(page);
  const car = (await diagnostics(page)).cars[0];
  await walkTo(page, car.position, 4.4);
  await page.keyboard.press('f');
  await expect.poll(async () => (await diagnostics(page)).vehicle?.id).toBe(0);
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  const moving = await diagnostics(page);
  expect(Math.abs(moving.vehicle!.speed)).toBeGreaterThan(1);
  expect(
    Math.hypot(moving.player.x - car.position.x, moving.player.z - car.position.z),
  ).toBeGreaterThan(0.5);
  await page.keyboard.press('h');
  await page.keyboard.down('Space');
  await page.waitForTimeout(1000);
  await page.keyboard.up('Space');
  expect(Math.abs((await diagnostics(page)).vehicle!.speed)).toBeLessThan(
    Math.abs(moving.vehicle!.speed),
  );
  await page.screenshot({ path: 'artifacts/driving.png' });
  await page.keyboard.press('f');
  await expect.poll(async () => (await diagnostics(page)).vehicle).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="resume"]')).toBeInViewport();
  await page.locator('[data-action="controls"]').click();
  await expect(page.locator('[data-action="back"]')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/mobile-controls.png' });
  expect(errors).toEqual([]);
});
test('roads lead from Raval to Castor using actual on-foot movement', async ({ page }) => {
  await boot(page);
  await start(page);
  const map = new MapAdapter();
  await walkTo(page, (await diagnostics(page)).npcs.find((n) => n.id === 'marcos')!.position);
  await page.keyboard.press('e');
  await finishDialogue(page);
  await walkTo(page, map.project([-0.0015, 40.10262]), 2);
  await walkTo(page, (await diagnostics(page)).npcs.find((n) => n.id === 'castor')!.position);
  await expect(page.locator('#interaction')).toContainText('Castor');
  await page.keyboard.press('e');
  await expect(page.locator('#dialogue h3')).toContainText('Castor');
  await finishDialogue(page);
  expect((await diagnostics(page)).stage).toBe(2);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'artifacts/gameplay.png' });
});

test('all eight tapes can be collected, including the one beside Lucas', async ({ page }) => {
  await boot(page);
  await start(page);
  const tapes = (await diagnostics(page)).tapes;
  for (const tape of tapes) {
    await loadPosition(page, tape.position);
    await expect(page.locator('#interaction')).toContainText('Pick up the tape');
    await page.keyboard.press('e');
    await expect.poll(async () => (await diagnostics(page)).tapes[tape.id].collected).toBe(true);
  }
  await expect(page.locator('.wallet')).toContainText('00350');
  await expect(page.locator('#toast')).toContainText('All 8 tapes found');
});
