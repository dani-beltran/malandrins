import { test, expect } from '@playwright/test';
import { freshSave } from '../src/systems/SaveStore';

test('loads a saved position on a bridge, walks across it, and keeps the camera above it', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 60000 });
  type State = ReturnType<import('../src/core/Game').Game['getDiagnostics']>;
  const inspect = () =>
    page.evaluate(() =>
      (window as unknown as { malandrins: { inspect(): State } }).malandrins.inspect(),
    );
  const bridge = (await inspect()).bridges.find((b) => b.road === 'Camí dels Romans')!;
  expect(bridge).toBeTruthy();
  const save = { ...freshSave(), position: bridge.approachStart, audio: false };
  await page.addInitScript(() => {
    const fixture = sessionStorage.getItem('malandrins.bridgeSpawn');
    if (fixture) {
      localStorage.setItem('malandrins.save.v1', fixture);
      sessionStorage.removeItem('malandrins.bridgeSpawn');
    }
  });
  await page.evaluate(
    (data) => sessionStorage.setItem('malandrins.bridgeSpawn', JSON.stringify(data)),
    save,
  );
  await page.reload();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('#hud')).toBeVisible();
  let state = await inspect();
  expect(state.player.y).toBeCloseTo(state.terrain.playerGround + 0.12, 3);
  expect(state.terrain.playerGround).toBeCloseTo(state.terrain.playerTerrain, 5);
  for (const target of [bridge.start, bridge.center, bridge.end]) {
    for (let i = 0; i < 60; i++) {
      state = await inspect();
      const dx = target.x - state.player.x,
        dz = target.z - state.player.z,
        d = Math.hypot(dx, dz);
      if (d < 1) break;
      const forward = -Math.sin(state.cameraYaw) * dx - Math.cos(state.cameraYaw) * dz;
      const right = Math.cos(state.cameraYaw) * dx - Math.sin(state.cameraYaw) * dz;
      const keys: string[] = [];
      if (Math.abs(forward) > d * 0.2) keys.push(forward > 0 ? 'w' : 's');
      if (Math.abs(right) > d * 0.2) keys.push(right > 0 ? 'd' : 'a');
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(250, Math.max(90, d * 80)));
      for (const key of keys) await page.keyboard.up(key);
    }
    state = await inspect();
    expect(Math.hypot(state.player.x - target.x, state.player.z - target.z)).toBeLessThan(1.2);
    expect(state.player.y).toBeCloseTo(state.terrain.playerGround + 0.12, 3);
    expect(state.terrain.playerGround).toBeLessThanOrEqual(bridge.maxRoadHeight + 0.12);
    expect(state.camera.y).toBeGreaterThan(state.camera.ground + 1.4);
  }
  await page.screenshot({ path: 'artifacts/bridges/walking-on-bridge.png' });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('[data-action="play"]').click();
  state = await inspect();
  expect(state.player.y).toBeCloseTo(state.terrain.playerGround + 0.12, 3);
  expect(Math.hypot(state.player.x - bridge.end.x, state.player.z - bridge.end.z)).toBeLessThan(
    1.2,
  );
  expect(errors).toEqual([]);
});
