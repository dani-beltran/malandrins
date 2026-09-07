import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? (existsSync(chrome) ? chrome : undefined),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173/');
  await page.locator('[data-action="play"]').waitFor({ timeout: 60000 });
  const files = await page.evaluate(async () => {
    const [
      { AssetLibrary },
      { ModelFactory },
      { GLTFExporter },
      { characters },
      { placeholderPortrait },
      { scoreStep, SCORE_STEP_SECONDS, SCORE_STEPS },
    ] = await Promise.all([
      import('/src/assets/AssetLibrary.ts'),
      import('/src/assets/ModelFactory.ts'),
      import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js'),
      import('/src/data/characters.ts'),
      import('/src/ui/portraits.ts'),
      import('/src/assets/score.ts'),
    ]);
    const assets = new AssetLibrary();
    await assets.load();
    const factory = new ModelFactory(assets),
      exporter = new GLTFExporter(),
      output = [];
    const base64 = async (buffer) => {
      const blob = new Blob([buffer]);
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    };
    for (const [name, model] of [
      ['raval-80', factory.car()],
      ['player', factory.person(0xe2d3af, 0xc99874, 0x3c302b, 'player').group],
      ['marcos', factory.person(characters[0].color, characters[0].skin, characters[0].hair).group],
      ['olive-tree', factory.tree()],
    ]) {
      const buffer = await exporter.parseAsync(model, { binary: true });
      output.push({ path: `models/${name}.glb`, data: await base64(buffer), binary: true });
    }
    for (const [name, texture] of assets.textures)
      output.push({
        path: `textures/${name}.png`,
        data: texture.image.toDataURL('image/png').split(',')[1],
        binary: true,
      });
    for (const c of characters)
      output.push({
        path: `portraits/${c.id}.svg`,
        data: decodeURIComponent(placeholderPortrait(c).split(',')[1]),
        binary: false,
      });
    const sampleRate = 22050,
      loopFrames = Math.round(SCORE_STEP_SECONDS * SCORE_STEPS * sampleRate),
      context = new OfflineAudioContext(1, loopFrames * 3, sampleRate),
      master = context.createGain();
    master.gain.value = 0.35;
    master.connect(context.destination);
    for (let i = 0; i < SCORE_STEPS * 3; i++)
      for (const tone of scoreStep(i)) {
        const osc = context.createOscillator(),
          gain = context.createGain(),
          time = i * SCORE_STEP_SECONDS;
        osc.type = tone.type;
        osc.frequency.value = tone.frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(tone.volume, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + tone.duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(time);
        osc.stop(time + tone.duration + 0.03);
      }
    const audio = (await context.startRendering())
        .getChannelData(0)
        .slice(loopFrames, loopFrames * 2),
      buffer = new ArrayBuffer(44 + audio.length * 2),
      view = new DataView(buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, audio.length * 2, true);
    for (let i = 0; i < audio.length; i++)
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, audio[i])) * 32767, true);
    output.push({ path: 'audio/ultima-llum.wav', data: await base64(buffer), binary: true });
    assets.dispose();
    return output;
  });
  for (const f of files) {
    const path = resolve('public/assets', f.path);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, f.binary ? Buffer.from(f.data, 'base64') : f.data);
  }
  console.log(`Exported ${files.length} original asset files to public/assets/.`);
} finally {
  await browser.close();
}
