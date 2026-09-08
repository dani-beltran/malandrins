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
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('artifacts/tunnels', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.malandrins?.inspect()?.tunnels?.length, {
    timeout: 60000,
  });
  const state = await page.evaluate(() => window.malandrins.inspect());
  const ids = process.argv.slice(2);
  for (const tunnel of state.tunnels.filter((t) => !ids.length || ids.includes(t.id))) {
    await page.goto(`http://127.0.0.1:5173/?tunnel=${encodeURIComponent(tunnel.id)}`);
    await page.waitForFunction(() => window.malandrins?.inspect()?.tunnels?.length, {
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/tunnels/${tunnel.id}.png` });
  }
  await writeFile(
    'artifacts/tunnels/browser-review.json',
    JSON.stringify(
      { tunnels: state.tunnels, drawCalls: state.drawCalls, triangles: state.triangles, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ tunnels: state.tunnels.length, errors }));
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
