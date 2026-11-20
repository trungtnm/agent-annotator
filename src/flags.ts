/**
 * Per-browser preferences of the tool (a hidden hint, a tip already learned), in
 * localStorage. Storage can be absent or throw (private mode, blocked site data): reads
 * then give the default and writes last until the page reloads.
 */

export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    if (value) window.localStorage.setItem(key, '1');
    else window.localStorage.removeItem(key);
  } catch {
    // The preference lasts until reload; nothing to report.
  }
}
