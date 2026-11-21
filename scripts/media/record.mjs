// Drives examples/demo with Playwright to make the README media from the real product.
//
//   node scripts/media/record.mjs shots   # 2x PNG screenshots into docs/media/
//   node scripts/media/record.mjs video   # 1440x900 walkthrough into docs/media/.work/
//
// Needs the demo running: `pnpm --dir examples/demo dev` (http://localhost:5199).
//
// A headless browser cannot answer Chrome's "share this tab?" prompt, so the demo's
// `captureScreen` is given a capture that takes a real Playwright screenshot of the page
// once the overlay has hidden itself. Everything else is the package as users get it.

import { mkdir, rm, rename, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const MODE = process.argv[2] ?? 'shots';
if (MODE !== 'shots' && MODE !== 'video') throw new Error(`Unknown mode ${MODE}: use shots or video`);
const VIDEO = MODE === 'video';
const BASE = process.env.DEMO_URL ?? 'http://localhost:5199/';
const OUT = fileURLToPath(new URL('../../docs/media/', import.meta.url));
const WORK = `${OUT}.work/`;
const W = 1440;
const H = 900;
const DPR = VIDEO ? 1 : 2;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Runs in the page before any of its scripts: cursor, captions, the prompt panel, capture. */
function pageKit() {
  const css = `
    #__cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none;
      transform: translate(-100px, -100px); transition: opacity .2s; filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); }
    #__cursor .ring { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; border-radius: 50%;
      border: 2px solid rgba(109,74,255,.9); opacity: 0; transform: scale(.4); }
    #__cursor.down .ring { animation: __ripple .45s ease-out; }
    @keyframes __ripple { 0% { opacity: .9; transform: scale(.4); } 100% { opacity: 0; transform: scale(1.6); } }
    #__caption { position: fixed; left: 256px; bottom: 104px; z-index: 2147483646; pointer-events: none;
      transform: translateY(20px); opacity: 0; transition: opacity .35s ease, transform .35s ease;
      display: flex; align-items: center; gap: 16px; padding: 16px 30px 16px 16px; border-radius: 999px;
      background: rgba(18,17,36,.92); color: #fff; font: 600 24px/1.2 Inter, system-ui, sans-serif;
      box-shadow: 0 12px 40px rgba(18,17,36,.35); backdrop-filter: blur(8px); white-space: nowrap; }
    #__caption.on { opacity: 1; transform: none; }
    #__caption .step { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #ff6cab, #6d4aff); font-size: 21px; }
    #__agent { position: fixed; inset: 0; z-index: 2147483645; display: grid; place-items: center;
      background: rgba(12,11,26,.55); backdrop-filter: blur(6px); opacity: 0; transition: opacity .4s; }
    #__agent.on { opacity: 1; }
    #__agent .win { width: 860px; max-height: 640px; overflow: hidden; border-radius: 14px; background: #0f0e1c;
      box-shadow: 0 30px 80px rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.08);
      transform: translateY(24px) scale(.98); transition: transform .5s cubic-bezier(.2,.8,.2,1); }
    #__agent.on .win { transform: none; }
    #__agent .bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #17162b;
      color: #a8a6c2; font: 500 13px Inter, system-ui, sans-serif; }
    #__agent .dot { width: 11px; height: 11px; border-radius: 50%; }
    #__agent pre { margin: 0; padding: 18px 22px; color: #e7e5f7; font: 13px/1.55 ui-monospace, 'SF Mono', Menlo, monospace;
      white-space: pre-wrap; height: 560px; overflow: hidden; }
    #__agent .scroll { animation: __scroll 9s 1.2s ease-in-out forwards; }
    @keyframes __scroll { to { transform: translateY(var(--travel)); } }
    #__agent .h { color: #c4b5ff; font-weight: 700; } #__agent .k { color: #ff9ecb; } #__agent .p { color: #7ee2a8; }
    #__agent .q { color: #ffd479; }
    [data-shooting] #__cursor, [data-shooting] #__caption { display: none !important; }
  `;
  const install = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = '__cursor';
    cursor.innerHTML =
      '<div class="ring"></div><svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.4L9.8 20z" fill="#fff" stroke="#121124" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement('div');
    caption.id = '__caption';
    document.body.appendChild(caption);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();

  // Registered first, in the capture phase: comment mode stops pointer events further down.
  window.addEventListener('mousemove', (event) => {
    const cursor = document.getElementById('__cursor');
    if (cursor) cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`;
  }, true);
  window.addEventListener('mousedown', () => {
    const cursor = document.getElementById('__cursor');
    if (!cursor) return;
    cursor.classList.remove('down');
    void cursor.offsetWidth;
    cursor.classList.add('down');
  }, true);

  window.__caption = (step, text) => {
    const caption = document.getElementById('__caption');
    if (!caption) return;
    if (text === null) {
      caption.classList.remove('on');
      return;
    }
    caption.innerHTML = `<span class="step">${step}</span><span></span>`;
    caption.lastChild.textContent = text;
    caption.classList.add('on');
  };

  window.__showPrompt = (prompt) => {
    const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // Data blocks cut to their first lines, so every comment, from every page, gets on screen.
    const kept = [];
    let fenced = 0;
    for (const line of prompt.split('\n')) {
      if (line.startsWith('```')) {
        if (fenced > 7) kept.push('  …');
        fenced = fenced === 0 ? 1 : 0;
        kept.push(line);
      } else if (fenced === 0 || fenced++ <= 7) kept.push(line);
    }
    const lines = kept.slice(0, 160).map((line) => {
      const safe = escape(line);
      if (/^#{1,3} /.test(line)) return `<span class="h">${safe}</span>`;
      if (/^> /.test(line)) return `<span class="q">${safe}</span>`;
      return safe.replace(/^(- \*\*[^*]+\*\*)/, '<span class="k">$1</span>').replace(/(`[^`]+`)/g, '<span class="p">$1</span>');
    });
    const panel = document.createElement('div');
    panel.id = '__agent';
    panel.innerHTML = `<div class="win"><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span style="margin-left:10px">your coding agent · pasted prompt</span></div><pre><div class="scroll">${lines.join('\n')}</div></pre></div>`;
    document.body.appendChild(panel);
    const scroll = panel.querySelector('.scroll');
    requestAnimationFrame(() => {
      panel.classList.add('on');
      const travel = Math.min(0, 520 - scroll.scrollHeight);
      scroll.style.setProperty('--travel', `${travel}px`);
    });
  };
  window.__hidePrompt = () => document.getElementById('__agent')?.remove();

  window.__agentAnnotatorCapture = async (prepare) => {
    await prepare();
    document.documentElement.dataset.shooting = '';
    const base64 = await window.__shootForAnnotator();
    delete document.documentElement.dataset.shooting;
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas;
  };
}

await mkdir(OUT, { recursive: true });
if (VIDEO) {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: DPR,
  ...(VIDEO ? { recordVideo: { dir: WORK, size: { width: W, height: H } } } : {}),
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
const page = await context.newPage();
// The video starts with the page: caption times, relative to this, let compose.mjs cut the loop.
const started = Date.now();
const marks = [];
await page.exposeFunction('__shootForAnnotator', async () => (await page.screenshot({ type: 'png' })).toString('base64'));
await page.addInitScript(pageKit);

// ---- helpers --------------------------------------------------------------------------------
let at = { x: W / 2, y: H / 2 };
const wait = (ms) => page.waitForTimeout(VIDEO ? ms : Math.min(ms, 400));
async function moveTo(point) {
  const distance = Math.hypot(point.x - at.x, point.y - at.y);
  const steps = VIDEO ? Math.max(8, Math.round(distance / 14)) : 2;
  await page.mouse.move(point.x, point.y, { steps });
  at = point;
}
async function centre(locator, dx = 0, dy = 0) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No box for ${locator}`);
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}
async function click(point) {
  await moveTo(point);
  await wait(180);
  await page.mouse.down();
  await wait(70);
  await page.mouse.up();
}
async function drag(from, to, { shift = false } = {}) {
  await moveTo(from);
  await wait(150);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  const steps = VIDEO ? 28 : 4;
  await page.mouse.move(to.x, to.y, { steps });
  at = to;
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
const type = (text) => page.keyboard.type(text, { delay: VIDEO ? 38 : 0 });
async function caption(step, text) {
  if (!VIDEO) return;
  marks.push({ step, text, at: (Date.now() - started) / 1000 });
  await page.evaluate(([s, t]) => window.__caption(s, t), [step, text]);
}
async function shot(name, clip) {
  if (VIDEO) return;
  await page.screenshot({ path: `${OUT}${name}.png`, ...(clip ? { clip } : {}) });
  console.log(`  saved ${name}.png`);
}
const button = (name) => page.getByRole('button', { name, exact: true });

// ---- the walkthrough ------------------------------------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  sessionStorage.clear();
  for (const key of Object.keys(localStorage)) if (key.startsWith('agent-annotator')) localStorage.removeItem(key);
});
await page.reload({ waitUntil: 'networkidle' });
await page.mouse.move(at.x, at.y);
await wait(800);

// 1 · comment mode
await caption(1, 'Turn on comment mode: Alt+Shift+C, or the toolbar');
await wait(1200);
await click(await centre(button('Turn on comment mode')));
await wait(900);
await shot('toolbar', { x: W - 430, y: H - 70, width: 430, height: 70 });

// 2 · click anything, say what should change
await caption(2, 'Click anything and say what should change');
for (const target of [page.getByText('Good morning, Jamie'), page.locator('.kpi').nth(1), page.getByRole('button', { name: 'New order' })]) {
  await moveTo(await centre(target));
  await wait(450);
}
await click(await centre(page.getByRole('button', { name: 'New order' })));
await wait(700);
await type('Make this the primary action: filled violet, like the Pro button');
await wait(500);
await shot('comment');
await page.keyboard.press(`${MOD}+Enter`);
await wait(800);
// Learned the shortcuts: put the hint away (the ? in the toolbar brings it back).
await click(await centre(button('Hide hint')));
await wait(500);

// an area
await caption(2, 'Shift-drag to comment on an area');
const kpis = await page.locator('section[aria-label="Key metrics"]').boundingBox();
await drag({ x: kpis.x - 10, y: kpis.y - 10 }, { x: kpis.x + kpis.width + 10, y: kpis.y + kpis.height + 10 }, { shift: true });
await wait(700);
await type('Cards feel cramped: 4px more padding, and the deltas should line up');
await wait(400);
await page.keyboard.press(`${MOD}+Enter`);
await wait(700);

// one more element; the comment list opens after each save, and here it would cover the table
await click(await centre(button('Hide list')));
await wait(400);
await click(await centre(page.getByText('$129.00')));
await wait(600);
await type('Right-align the money column');
await wait(300);
await page.keyboard.press(`${MOD}+Enter`);
await wait(700);
await click(await centre(button('Hide list')));
await wait(500);

// see them all
await caption(3, 'See every comment right where it belongs');
await click(await centre(button('Show comments in full')));
await wait(2200);
await shot('comments');

// 4 · another page: the comments come along, and the prompt will cover both pages
await click(await centre(button('Show comments as numbers')));
await wait(500);
await caption(4, 'Keep going on another page: Alt+click to navigate');
await moveTo(await centre(page.getByRole('link', { name: 'Customers' })));
await page.keyboard.down('Alt');
await click(await centre(page.getByRole('link', { name: 'Customers' })));
await page.keyboard.up('Alt');
await page.getByRole('heading', { name: 'Customers', level: 1 }).waitFor();
await wait(1400);

// 5 · personal data: choose what is screened before commenting on a page full of it
await caption(5, 'Redact personal data: pick countries, add patterns');
await click(await centre(button('Redaction settings')));
await wait(800);
await click(await centre(page.getByRole('checkbox', { name: /United States/ })));
await wait(500);
await click(await centre(page.getByRole('textbox', { name: /regular expression/ })));
await type('ACCT-\\d{8}');
await wait(900);
const settings = await page.getByRole('dialog', { name: 'Redaction settings' }).boundingBox();
await shot('redaction', { x: settings.x - 24, y: settings.y - 24, width: W - settings.x + 24, height: H - settings.y + 24 });
await click(await centre(button('Close redaction settings')));
await wait(500);
await click(await centre(page.locator('tr', { hasText: 'Olivia Johnson' }).locator('td').nth(2)));
await wait(600);
await type('Store phone numbers in E.164 and validate them per country on save');
await wait(300);
await page.keyboard.press(`${MOD}+Enter`);
await wait(900);
await caption(5, 'One list, every page: comments from earlier pages stay');
await wait(1600);
const list = await page.getByLabel('Comment list', { exact: true }).boundingBox();
await shot('pages', { x: list.x - 24, y: list.y - 24, width: W - list.x + 24, height: H - list.y + 24 });
await click(await centre(button('Hide list')));
await wait(400);

// 6 · copy prompt, paste into the agent
await caption(6, 'Copy one prompt: files, lines, components, data');
await click(await centre(page.getByRole('button', { name: 'Copy prompt' })));
await wait(1600);
const prompt = await page.evaluate(() => navigator.clipboard.readText());
await writeFile(`${OUT}sample-prompt.md`, prompt);
await caption(6, 'Paste it into Claude Code, Codex or Cursor');
await page.evaluate((text) => window.__showPrompt(text), prompt);
await wait(VIDEO ? 9500 : 1200);
await shot('prompt');
if (!VIDEO) {
  // The same prompt further down: the comment from the second page, its data redacted.
  await page.evaluate(() => {
    const scroll = document.querySelector('#__agent .scroll');
    const heading = [...scroll.querySelectorAll('.h')].find((line) => line.textContent.startsWith('## 4.'));
    scroll.style.animation = 'none';
    scroll.style.transform = `translateY(${12 - (heading.getBoundingClientRect().top - scroll.getBoundingClientRect().top)}px)`;
  });
  await wait(300);
  await shot('prompt-pages');
}
await page.evaluate(() => window.__hidePrompt());
await wait(400);

// 7 · screenshot + markup, back on the dashboard
await page.keyboard.down('Alt');
await click(await centre(page.getByRole('link', { name: 'Orders' })));
await page.keyboard.up('Alt');
await page.getByText('Good morning, Jamie').waitFor();
await wait(600);
await caption(7, 'Need a picture? Capture and mark it up');
await click(await centre(button('Screenshot')));
await page.getByRole('dialog', { name: 'Screenshot editor' }).waitFor();
await wait(900);

// Page point → its place in the editor, from the canvas geometry (the board is centred on the
// image). Measured afresh for every mark: a mark past the edge grows the picture and re-fits it.
async function editorMap() {
  const map = await page.evaluate(([w, h, dpr]) => {
    const canvas = document.querySelector('[aria-label="Screenshot editor"] canvas');
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    return { left: rect.left + rect.width / 2 - (w * dpr * scale) / 2, top: rect.top + rect.height / 2 - (h * dpr * scale) / 2, k: dpr * scale };
  }, [W, H, DPR]);
  return (point) => ({ x: map.left + point.x * map.k, y: map.top + point.y * map.k });
}
let ed = await editorMap();

await page.keyboard.press('t');
await wait(400);
const newOrder = await centre(page.getByRole('button', { name: 'New order' }));
// The text goes in the empty lower part of the Pro card; the tail stays on the button.
await drag(ed(newOrder), ed({ x: newOrder.x - 330, y: newOrder.y + 465 }));
await wait(400);
await type('Primary, please');
await page.keyboard.press('Enter');
await wait(600);

await page.keyboard.press('a');
ed = await editorMap();
const total = await centre(page.getByText('$129.00'));
await drag(ed({ x: total.x - 300, y: total.y + 100 }), ed({ x: total.x - 40, y: total.y + 8 }));
await wait(600);

await caption(7, 'Pixelate personal data before it leaves your machine');
await page.keyboard.press('b');
ed = await editorMap();
// Only the emails on screen: the capture is the viewport.
const emailBoxes = (await Promise.all((await page.getByText(/@example\.com$/).all()).map((email) => email.boundingBox())))
  .filter((box) => box !== null && box.y + box.height < H - 4);
const first = emailBoxes[0];
const last = emailBoxes[emailBoxes.length - 1];
const widest = Math.max(...emailBoxes.map((box) => box.width));
await drag(ed({ x: first.x - 4, y: first.y - 3 }), ed({ x: first.x + widest + 6, y: last.y + last.height + 3 }));
await wait(700);

await page.keyboard.press('m');
ed = await editorMap();
const card = await page.locator('.kpi').first().boundingBox();
await drag(ed({ x: card.x, y: card.y + card.height + 8 }), ed({ x: card.x + card.width, y: card.y + card.height + 8 }));
await wait(900);
await moveTo({ x: W - 300, y: 120 });
await shot('editor');
await page.keyboard.press(`${MOD}+c`);
await caption(7, 'Copy or save the PNG');
await wait(1800);
await caption(null, null);
await wait(600);

await context.close();
await browser.close();

if (VIDEO) {
  const [file] = (await readdir(WORK)).filter((name) => name.endsWith('.webm'));
  await rename(`${WORK}${file}`, `${WORK}walkthrough.webm`);
  await writeFile(`${WORK}marks.json`, JSON.stringify(marks, null, 2));
  console.log(`  recorded ${WORK}walkthrough.webm`);
}
