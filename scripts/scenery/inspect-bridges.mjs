import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await mkdir('artifacts/bridges', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 60000 });
  const state = await page.evaluate(() => window.malandrins.inspect());
  const ids = process.argv.slice(2);
  const choices = ids.length
    ? ids
    : [
        state.bridges.find((b) => b.road === 'Camí de les Santes')?.id,
        state.bridges.find(
          (b) => b.id.startsWith('bridge-track') && b.center.x > 20 && b.center.x < 120,
        )?.id,
        state.bridges.find((b) => b.road === 'Camí dels Romans')?.id,
      ].filter(Boolean);
  for (const id of choices) {
    await page.goto(`http://127.0.0.1:5173/?bridge=${encodeURIComponent(id)}`);
    await page.waitForFunction(() => window.malandrins?.inspect()?.bridges?.length, {
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/bridges/${id}.png` });
  }
  await writeFile(
    'artifacts/bridges/browser-review.json',
    JSON.stringify(
      {
        bridges: state.bridges,
        drawCalls: state.drawCalls,
        triangles: state.triangles,
        views: choices,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ crossings: state.bridges.length, views: choices, errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
