import { test, expect } from '@playwright/test';
import { freshSave } from '../src/systems/SaveStore';

test('walks through a highway tunnel, saves below the deck and keeps the camera inside', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  type State = ReturnType<import('../src/core/Game').Game['getDiagnostics']>;
  const inspect = () =>
    page.evaluate(() =>
      (window as unknown as { malandrins: { inspect(): State } }).malandrins.inspect(),
    );
  await page.goto('/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 60000 });
  const tunnel = (await inspect()).tunnels.find((t) => t.id === 'tunnel-track-349.36-1.54')!;
  expect(tunnel).toBeTruthy();
  await page.addInitScript(() => {
    const save = sessionStorage.getItem('malandrins.tunnelSpawn');
    if (save) {
      localStorage.setItem('malandrins.save.v1', save);
      sessionStorage.removeItem('malandrins.tunnelSpawn');
    }
  });
  await page.evaluate(
    (save) => sessionStorage.setItem('malandrins.tunnelSpawn', JSON.stringify(save)),
    {
      ...freshSave(),
      position: tunnel.approachStart,
      audio: false,
    },
  );
  await page.reload();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#hud')).toBeVisible();
  let savedInside = false;
  for (const target of tunnel.route.slice(1)) {
    for (let i = 0; i < 70; i++) {
      const state = await inspect();
      const dx = target.x - state.player.x,
        dz = target.z - state.player.z,
        d = Math.hypot(dx, dz);
      if (d < 0.6) break;
      const forward = -Math.sin(state.cameraYaw) * dx - Math.cos(state.cameraYaw) * dz;
      const right = Math.cos(state.cameraYaw) * dx - Math.sin(state.cameraYaw) * dz;
      const keys: string[] = [];
      if (Math.abs(forward) > d * 0.2) keys.push(forward > 0 ? 'w' : 's');
      if (Math.abs(right) > d * 0.2) keys.push(right > 0 ? 'd' : 'a');
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(220, Math.max(60, d * 80)));
      for (const key of keys) await page.keyboard.up(key);
    }
    let state = await inspect();
    expect(Math.hypot(state.player.x - target.x, state.player.z - target.z)).toBeLessThan(0.9);
    expect(state.player.y).toBeCloseTo(state.terrain.playerGround + 0.12, 3);
    if (
      !savedInside &&
      Math.hypot(state.player.x - tunnel.center.x, state.player.z - tunnel.center.z) < 10
    ) {
      expect(state.player.y).toBeCloseTo(tunnel.floorHeight + 0.12, 2);
      await page.waitForTimeout(500);
      state = await inspect();
      expect(state.camera.y).toBeLessThan(tunnel.floorHeight + 2.5);
      await page.screenshot({ path: 'artifacts/tunnels/walking-inside.png' });
      await page.keyboard.press('Escape');
      await page.reload();
      await page.locator('[data-action="play"]').click();
      state = await inspect();
      expect(state.player.y).toBeCloseTo(tunnel.floorHeight + 0.12, 2);
      savedInside = true;
    }
  }
  expect(savedInside).toBe(true);
  expect(errors).toEqual([]);
});
