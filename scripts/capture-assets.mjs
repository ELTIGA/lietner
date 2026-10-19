/**
 * Regenerates launch assets from a running dev server (it needs the dev-only window.__leitner):
 *   npm run dev            # in another terminal
 *   node scripts/capture-assets.mjs [http://localhost:5173]
 *   python3 scripts/frames-to-gif.py
 * Writes public/og.jpg (1200×630) and frames for docs/demo.gif. Animations are stepped frame by
 * frame, so the result is smooth even though headless WebGL renders slowly.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';

import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:5173';
const framesDir = 'test-results/demo-frames';

const browser = await chromium.launch();

async function openWithSample(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('.home-panel').waitFor();
  await page.getByRole('button', { name: /Spanish sample deck/ }).click();
  await page.locator('.home-status').filter({ hasText: 'due today' }).waitFor();
  await page.evaluate(() => window.__leitner.app.setSpeed(1));
  return page;
}

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const idle = (page) => page.waitForFunction(() => !window.__leitner.actor.busy);

// ---- Open Graph image: the first card lifted out of box 1 ----
{
  const page = await openWithSample({ width: 1200, height: 630 });
  await page.addStyleTag({ content: '.review-hud { display: none !important; } .toasts { display: none; }' });
  await page.evaluate(() => window.__leitner.app.startReview());
  await idle(page);
  await settle(page);
  await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 82 });
  await page.context().close();
}

// ---- Demo GIF frames ----
{
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const page = await openWithSample({ width: 720, height: 450 });
  // The undo toast would cover the boxes the cards fly into.
  await page.addStyleTag({ content: '.toasts { display: none; }' });
  const durations = [];
  let index = 0;

  async function frame(ms = 40) {
    await settle(page);
    await writeFile(`${framesDir}/${String(index++).padStart(4, '0')}.png`, await page.screenshot());
    durations.push(ms);
  }

  /**
   * Runs an input, then steps the next animation through `steps` frames. "Next" means any
   * timeline other than the last one stepped, so chained animations (file, then draw) work too.
   */
  async function animate(trigger, steps) {
    await trigger();
    await page.waitForFunction(() => !!window.__leitner.actor.timeline && window.__leitner.actor.timeline !== window.__lastStepped);
    await page.evaluate(() => {
      window.__lastStepped = window.__leitner.actor.timeline;
      window.__lastStepped.pause();
    });
    for (let step = 1; step <= steps; step++) {
      await page.evaluate((progress) => {
        window.__leitner.actor.timeline.progress(progress).pause();
        window.__leitner.stage.requestRender();
      }, step / steps);
      await frame();
    }
  }

  const key = (name) => () => page.keyboard.press(name);
  await frame(1400);
  await animate(key('Enter'), 14);
  await frame(900);
  await animate(key('Space'), 9);
  await frame(1300);
  await animate(key('j'), 14); // into box 2
  await animate(async () => {}, 12); // next card comes out
  await frame(900);
  await animate(key('Space'), 9);
  await frame(1200);
  await animate(key('f'), 18); // missed: shake, back to box 1
  await animate(async () => {}, 12);
  await frame(1600);

  await writeFile(`${framesDir}/durations.json`, JSON.stringify(durations));
  console.log(`${index} frames in ${framesDir}`);
}

await browser.close();
