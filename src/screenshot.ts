/**
 * Taking the screenshot, and getting it out of the browser.
 *
 * The capture is the tab itself, through the Screen Capture API: the browser asks once
 * ("share this tab?") and hands back real pixels — canvases, videos, cross-origin images
 * and fonts exactly as rendered, which a DOM-to-image library can only approximate. Between
 * the permission and the grab, `prepare` gets the page ready: the tool's own controls away,
 * every comment shown in full.
 */

export type ScreenCapture = (prepare: () => Promise<void>) => Promise<HTMLCanvasElement>;

/** The browser asked, and the person said no (or closed the picker). */
export class CaptureCancelled extends Error {
  constructor() {
    super('Screen capture was cancelled');
    this.name = 'CaptureCancelled';
  }
}

export const captureTab: ScreenCapture = async (prepare) => {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (media?.getDisplayMedia === undefined) {
    throw new Error('This browser cannot capture the tab (it needs the Screen Capture API, on localhost or https).');
  }
  const ratio = window.devicePixelRatio || 1;
  let stream: MediaStream;
  try {
    stream = await media.getDisplayMedia({
      video: {
        displaySurface: 'browser',
        width: { ideal: Math.round(window.innerWidth * ratio) },
        height: { ideal: Math.round(window.innerHeight * ratio) },
        // Not part of the DOM lib yet; Chrome honours it.
        ...{ cursor: 'never' },
      },
      audio: false,
      // Chrome: offer this tab first, as a one-click "Allow".
      ...{ preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', monitorTypeSurfaces: 'exclude' },
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError') throw new CaptureCancelled();
    throw error;
  }
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    await prepare();
    await freshFrame(video);
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  }
};

/** Waits until the stream shows what the page looks like NOW, not before `prepare`. */
async function freshFrame(video: HTMLVideoElement): Promise<void> {
  if (typeof video.requestVideoFrameCallback === 'function') {
    for (let frame = 0; frame < 3; frame++) {
      await Promise.race([
        new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())),
        // A static page may produce no new frame at all; then the current one is current.
        new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
      ]);
    }
    return;
  }
  await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error('The image could not be encoded')) : resolve(blob)), 'image/png');
  });
}

export async function copyImage(canvas: HTMLCanvasElement): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || navigator.clipboard?.write === undefined) {
    throw new Error('This browser cannot put an image on the clipboard; use Save instead.');
  }
  // The promise form keeps the user activation alive while the PNG encodes (Safari needs it).
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasBlob(canvas) })]);
}

export async function saveImage(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const url = URL.createObjectURL(await canvasBlob(canvas));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.setAttribute('data-dev-annotator', '');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `web-orders-7-2026-11-20-2350.png`: the app, the page and the minute. */
export function shotFileName(appName: string, pathname: string, now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const page = pathname
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-z0-9-]+/gi, '')
    .slice(0, 40);
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${[appName, page || 'home', stamp].join('-')}.png`;
}
