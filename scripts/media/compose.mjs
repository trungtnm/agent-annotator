// Turns the recorded walkthrough into the README media:
//
//   docs/media/demo.mp4   intro title → walkthrough → outro, cross-faded, 1280x800 H.264
//   docs/media/hero.gif   a short loop of the best moments, for the top of the README
//
// The titles (scripts/media/titles.html) are pure CSS animation, rendered frame by frame by
// stepping the animation clock, so they are exact and smooth regardless of machine load.
// Needs ffmpeg on PATH and a prior `node scripts/media/record.mjs video`.

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const OUT = fileURLToPath(new URL('../../docs/media/', import.meta.url));
const WORK = `${OUT}.work/`;
const TITLES = new URL('./titles.html', import.meta.url).href;
const FPS = 30;
const SCENE_SECONDS = 4.6;
const FADE = 0.6;

const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const seconds = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

async function renderScene(browser, scene) {
  const dir = `${WORK}${scene}/`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(TITLES, { waitUntil: 'networkidle' });
  await page.evaluate(async (name) => {
    document.body.dataset.scene = name;
    await document.fonts.ready;
  }, scene);
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.pause()));
  const frames = Math.round(SCENE_SECONDS * FPS);
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate((ms) => document.getAnimations().forEach((animation) => (animation.currentTime = ms)), (frame * 1000) / FPS);
    await page.screenshot({ path: `${dir}${String(frame).padStart(4, '0')}.png` });
  }
  await page.close();
  ffmpeg('-framerate', String(FPS), '-i', `${dir}%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', `${WORK}${scene}.mp4`);
  console.log(`  rendered ${scene} (${frames} frames)`);
}

const browser = await chromium.launch();
await renderScene(browser, 'intro');
await renderScene(browser, 'outro');
await browser.close();

// The walkthrough at the same frame rate, so the cross-fades line up.
ffmpeg('-i', `${WORK}walkthrough.webm`, '-vf', `fps=${FPS}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', `${WORK}walk.mp4`);
const walk = seconds(`${WORK}walk.mp4`);

const normalise = `fps=${FPS},scale=1440:900,setsar=1,format=yuv420p,settb=AVTB`;
ffmpeg(
  '-i', `${WORK}intro.mp4`, '-i', `${WORK}walk.mp4`, '-i', `${WORK}outro.mp4`,
  '-filter_complex',
  [
    `[0:v]${normalise}[a]`,
    `[1:v]${normalise}[b]`,
    `[2:v]${normalise}[c]`,
    `[a][b]xfade=transition=fade:duration=${FADE}:offset=${SCENE_SECONDS - FADE}[ab]`,
    `[ab][c]xfade=transition=fade:duration=${FADE}:offset=${SCENE_SECONDS + walk - 2 * FADE}[all]`,
    `[all]scale=1280:800:flags=lanczos[out]`,
  ].join(';'),
  '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  `${OUT}demo.mp4`,
);
console.log(`  wrote demo.mp4 (${(await stat(`${OUT}demo.mp4`)).size >> 10} KB, ${seconds(`${OUT}demo.mp4`).toFixed(1)}s)`);

// The loop: the best seconds of each step, found by the captions the recorder logged.
const marks = JSON.parse(await readFile(`${WORK}marks.json`, 'utf8'));
const at = (fragment) => {
  const mark = marks.find((entry) => entry.text?.includes(fragment));
  if (mark === undefined) throw new Error(`No caption containing "${fragment}"`);
  return mark.at;
};
const cuts = [
  [at('Click anything') + 2.6, 5.4],
  [at('See every comment') + 0.4, 2.6],
  [at('Paste it') + 0.3, 3.6],
  [at('Need a picture') + 1.2, 8.4],
];
const parts = cuts.map(([start, length], index) => `[0:v]trim=start=${start.toFixed(2)}:duration=${length},setpts=PTS-STARTPTS[p${index}]`);
const joined = `${cuts.map((_, index) => `[p${index}]`).join('')}concat=n=${cuts.length}:v=1:a=0[loop]`;
const look = 'fps=12,scale=960:-1:flags=lanczos';
ffmpeg(
  '-i', `${WORK}walk.mp4`,
  '-filter_complex',
  `${parts.join(';')};${joined};[loop]${look},split[x][y];[x]palettegen=max_colors=160:stats_mode=diff[pal];[y][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  '-loop', '0',
  `${OUT}hero.gif`,
);
console.log(`  wrote hero.gif (${(await stat(`${OUT}hero.gif`)).size >> 10} KB)`);
