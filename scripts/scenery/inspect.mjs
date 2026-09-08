import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 738, height: 1087 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
const ids = process.argv.slice(2);
try {
  for (const id of ids.length ? ids : ['03', '04', '19', '20', '23', '24']) {
    await page.goto(`http://127.0.0.1:5173/?reference=${id}`);
    await page.waitForFunction(() => window.malandrins?.inspect()?.scenery.referenceView, {
      timeout: 60000,
    });
    await page.waitForTimeout(700);
    const diagnostics = await page.evaluate(() => window.malandrins.inspect());
    await page.screenshot({ path: `artifacts/scenery/view-${id}.png` });
    console.log(
      id,
      JSON.stringify({
        triangles: diagnostics.triangles,
        drawCalls: diagnostics.drawCalls,
        scenery: diagnostics.scenery,
      }),
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 60000 });
  await page.screenshot({ path: 'artifacts/scenery/town-overview.png' });
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'artifacts/scenery/town-gameplay.png' });
  await fs.writeFile('artifacts/scenery/browser-errors.json', JSON.stringify(errors, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
