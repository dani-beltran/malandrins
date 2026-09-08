import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

// Exercise the real game scene; the review camera is injected only in this browser.
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.route(/\/src\/main\.ts(?:\?|$)/, (route) =>
  route.fulfill({
    contentType: 'application/javascript',
    body: `import '/src/style.css';
      import { Game } from '/src/core/Game.ts';
      import well from '/src/data/scenery/portal-well.json';
      const game = new Game(document.getElementById('world'), document.getElementById('ui'));
      await game.initialize();
      document.getElementById('ui').hidden = true;
      game.player.object.visible = false;
      game.npcs.forEach(n => n.object.visible = false);
      game.vehicles.forEach(v => v.object.visible = false);
      game.tapes.forEach(t => t.object.visible = false);
      game.activeMarker.visible = false;
      game.graphics.setQuality('clear');
      const [x,z] = well.position;
      const ground = game.terrain.heightAt(x,z);
      window.wellReview = { game, well, ground, view: 'close' };
      const render = game.graphics.render.bind(game.graphics);
      game.graphics.render = () => {
        const close = window.wellReview.view === 'close';
        game.graphics.camera.position.set(x + (close ? 2.9 : -9), ground + (close ? 2.25 : 7), z + (close ? 4.2 : 11));
        game.graphics.camera.fov = close ? 43 : 58;
        game.graphics.camera.updateProjectionMatrix();
        game.graphics.camera.lookAt(x, ground + (close ? 1.35 : .8), z);
        game.graphics.followLight(game.graphics.camera.position);
        render();
      };`,
  }),
);
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.wellReview, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/scenery/well-in-game.png' });
  const review = await page.evaluate(async () => {
    const { closestOnSegment, distance } = await import('/src/core/math.ts');
    const { game, well, ground } = window.wellReview;
    const [x, z] = well.position;
    const center = { x, z };
    const radius = Math.max(...well.points.map(([x, z]) => distance(center, { x, z })));
    const roadEdgeClearance = Math.min(
      ...game.map.roads.flatMap((road) =>
        road.points
          .slice(1)
          .map(
            (point, i) =>
              distance(center, closestOnSegment(center, road.points[i], point)) -
              road.width / 2 -
              radius,
          ),
      ),
    );
    const routes = Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI * 2) / 16;
      const p = { x: x + Math.cos(a) * 2.1, z: z + Math.sin(a) * 2.1 };
      return { ...p, blocked: game.world.collision.blocked(p, 0.35) };
    });
    return {
      position: { x, y: ground + 0.12, z },
      centerBlocked: game.world.collision.blocked({ x, z }, 0.35),
      roadEdgeClearance,
      routes,
      scenery: game.getDiagnostics().scenery,
    };
  });
  await page.evaluate(() => {
    window.wellReview.view = 'junction';
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/scenery/well-junction.png' });
  await fs.writeFile(
    'artifacts/scenery/well-review.json',
    JSON.stringify({ ...review, errors }, null, 2) + '\n',
  );
  if (
    review.roadEdgeClearance <= 0.15 ||
    !review.centerBlocked ||
    review.routes.some((p) => p.blocked) ||
    errors.length
  )
    throw new Error('Well placement review failed: ' + JSON.stringify({ ...review, errors }));
  console.log(
    JSON.stringify({
      position: review.position,
      roadEdgeClearance: review.roadEdgeClearance,
      collision: 'solid, with clear walking routes',
      errors,
    }),
  );
} catch (error) {
  console.error('Browser errors:', errors);
  await page.screenshot({ path: '/tmp/malandrins-well-review-failure.png' });
  throw error;
} finally {
  await browser.close();
}
