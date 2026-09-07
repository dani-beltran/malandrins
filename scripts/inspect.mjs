import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173/');
await page.getByRole('button', { name: 'Enter the town' }).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'artifacts/title-screen.png' });
await page.getByRole('button', { name: 'Enter the town' }).click();
await page.waitForTimeout(1600);
await page.screenshot({ path: 'artifacts/gameplay.png' });
console.log(JSON.stringify({ errors, text: await page.locator('#ui').innerText() }, null, 2));
await browser.close();
