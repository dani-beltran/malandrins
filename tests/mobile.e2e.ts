import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { freshSave } from '../src/systems/SaveStore';
type Diagnostics = ReturnType<import('../src/core/Game').Game['getDiagnostics']>;
const inspect = (page: Page): Promise<Diagnostics> =>
  page.evaluate(() =>
    (window as unknown as { malandrins: { inspect: () => Diagnostics } }).malandrins.inspect(),
  );

class Fingers {
  private points = new Map<number, { id: number; x: number; y: number }>();
  constructor(private session: CDPSession) {}
  async down(id: number, x: number, y: number) {
    this.points.set(id, { id, x, y });
    await this.session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [...this.points.values()],
    });
  }
  async up(id: number) {
    this.points.delete(id);
    await this.session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [...this.points.values()],
    });
  }
  async cancel() {
    this.points.clear();
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }
}
async function center(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function boot(page: Page) {
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem('malandrins.mobileFixture');
    if (fixture) {
      localStorage.setItem('malandrins.save.v1', fixture);
      sessionStorage.removeItem('malandrins.mobileFixture');
    }
  });
  await page.goto('/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 45000 });
}
async function loadPosition(page: Page, position: { x: number; z: number }) {
  await page.evaluate(
    (save) => sessionStorage.setItem('malandrins.mobileFixture', JSON.stringify(save)),
    {
      ...freshSave(),
      quality: 'retro',
      position,
    },
  );
  await page.reload();
  await page.locator('[data-action="play"]').tap();
}
async function expectControlsFit(page: Page) {
  const selectors = [
    '.touch-stick',
    '#touch-controls button:not([hidden])',
    '.hud-icon',
    '.map-open',
  ];
  for (const selector of selectors) {
    for (const element of await page.locator(selector).all()) {
      await expect(element).toBeInViewport({ ratio: 1 });
      const box = (await element.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const exposed = await element.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      expect(exposed).toBe(true);
    }
  }
}

test.describe('mobile touch gameplay', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  test('walk, sprint, camera, dialogue, map and pause work with touch alone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await boot(page);
    await expect(page.locator('#touch-controls')).toBeHidden();
    await page.locator('[data-action="controls"]').tap();
    await expect(page.locator('.control-list')).toContainText('Left joystick');
    await page.locator('[data-action="back"]').tap();
    await page.locator('[data-action="play"]').tap();
    await expectControlsFit(page);
    const fingers = new Fingers(await page.context().newCDPSession(page));
    const stick = await center(page, '.touch-stick');
    const sprint = await center(page, '[data-motion]');
    const before = await inspect(page);
    await fingers.down(1, stick.x, stick.y - 48);
    await fingers.down(2, sprint.x, sprint.y);
    await expect(page.locator('[data-motion]')).toHaveClass(/held/);
    await expect
      .poll(async () => {
        const s = await inspect(page);
        return Math.hypot(s.player.x - before.player.x, s.player.z - before.player.z);
      })
      .toBeGreaterThan(0.5);
    await fingers.cancel();
    await expect(page.locator('.touch-stick')).not.toHaveClass(/held/);
    const stopped = await inspect(page);
    await page.waitForTimeout(250);
    expect((await inspect(page)).player).toEqual(stopped.player);
    const camera = await center(page, '[data-key="KeyR"]');
    await fingers.down(3, camera.x, camera.y);
    await expect
      .poll(async () => (await inspect(page)).cameraYaw - stopped.cameraYaw)
      .toBeGreaterThan(0.1);
    await fingers.up(3);
    // A screen transition must release a joystick still held by another finger.
    await fingers.down(1, stick.x + 40, stick.y);
    await page.locator('.hud-icon').tap();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await fingers.cancel();
    await page.locator('[data-action="resume"]').tap();
    await expect(page.locator('.touch-stick')).not.toHaveClass(/held/);
    await page.locator('.map-open').tap();
    await expect(page.locator('#large-map')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    await page.locator('.map-heading [data-action="resume"]').tap();
    const marcos = (await inspect(page)).npcs.find((n) => n.id === 'marcos')!;
    await loadPosition(page, marcos.position);
    await page.locator('[data-key="KeyE"]').tap();
    await expect(page.locator('#dialogue')).toBeVisible();
    await expect(page.locator('#touch-controls')).toBeHidden();
    for (let i = 0; i < 5 && (await page.locator('#dialogue').isVisible()); i++)
      await page.locator('[data-action="dialogue"]').tap();
    await expect.poll(async () => (await inspect(page)).stage).toBe(1);
    await expect(page.locator('#touch-controls')).toBeVisible();
    await page.screenshot({ path: '/tmp/malandrins-mobile-portrait.png' });
    expect(errors).toEqual([]);
  });
  test('drive, brake, exit and rotate between phone layouts', async ({ page }) => {
    await boot(page);
    const car = (await inspect(page)).cars[0];
    await loadPosition(page, car.position);
    await page.locator('[data-key="KeyF"]').tap();
    await expect.poll(async () => (await inspect(page)).vehicle?.id).toBe(car.id);
    await expect(page.locator('[data-motion]')).toHaveText('Brake');
    await expect(page.locator('[data-key="KeyH"]')).toBeVisible();
    const fingers = new Fingers(await page.context().newCDPSession(page));
    const stick = await center(page, '.touch-stick');
    await fingers.down(1, stick.x, stick.y - 48);
    await expect
      .poll(async () => Math.abs((await inspect(page)).vehicle!.speed))
      .toBeGreaterThan(1);
    await fingers.up(1);
    const brake = await center(page, '[data-motion]');
    await fingers.down(2, brake.x, brake.y);
    await expect.poll(async () => Math.abs((await inspect(page)).vehicle!.speed)).toBeLessThan(0.3);
    await fingers.up(2);
    await page.locator('[data-key="KeyH"]').tap();
    await page.locator('[data-key="KeyF"]').tap();
    await expect.poll(async () => (await inspect(page)).vehicle).toBeNull();
    await expect(page.locator('[data-motion]')).toHaveText('Sprint');
    await fingers.down(1, stick.x, stick.y - 48);
    await page.setViewportSize({ width: 844, height: 390 });
    await fingers.cancel();
    await expect(page.locator('.touch-stick')).not.toHaveClass(/held/);
    await expectControlsFit(page);
    await page.screenshot({ path: '/tmp/malandrins-mobile-landscape.png' });
    await page.locator('.hud-icon').tap();
    await page.locator('[data-action="settings"]').tap();
    await page.locator('.settings-panel [data-action="language"][data-value="ca"]').tap();
    await page.locator('[data-action="back"]').tap();
    await page.locator('[data-action="resume"]').tap();
    await expect(page.locator('[data-key="KeyF"]')).toHaveText('Cotxe');
    await page.setViewportSize({ width: 320, height: 568 });
    await expectControlsFit(page);
  });
});

test('desktop stays keyboard-only at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#touch-controls')).toBeHidden();
  await expect(page.locator('#ui')).not.toHaveClass(/mobile/);
  const yaw = (await inspect(page)).cameraYaw;
  await page.keyboard.down('r');
  await expect.poll(async () => (await inspect(page)).cameraYaw - yaw).toBeGreaterThan(0.1);
  await page.keyboard.up('r');
});
