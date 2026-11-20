import { afterEach, describe, expect, it } from 'vitest';

import { controlValue, cssSelector, describeElement, elementText } from './selector';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('cssSelector', () => {
  it('anchors on the nearest unique id and walks positionally below it', () => {
    document.body.innerHTML = '<main id="content"><div><p>a</p><p><span>x</span></p></div></main>';
    const span = document.querySelector('span')!;
    const selector = cssSelector(span);
    expect(selector).toBe('#content > div > p:nth-of-type(2) > span');
    expect(document.querySelector(selector)).toBe(span);
  });

  it('prefers a unique test id and ignores React useId ids', () => {
    document.body.innerHTML = '<section><button id=":r1:" data-testid="save">Lưu</button><button>Huỷ</button></section>';
    expect(cssSelector(document.querySelector('button')!)).toBe('[data-testid="save"]');
  });

  it('does not anchor on an id that is not unique', () => {
    document.body.innerHTML = '<div id="dup"><b>1</b></div><div id="dup"><b>2</b></div>';
    const second = document.querySelectorAll('b')[1]!;
    expect(document.querySelector(cssSelector(second))).toBe(second);
  });
});

describe('element description', () => {
  it('quotes identity attributes and screens personal data in text and values', () => {
    document.body.innerHTML =
      '<button type="submit" aria-label="Gọi 0912345678" class="  px-2   py-1 ">Gọi   0912345678</button><input value="a@b.vn">';
    const button = document.querySelector('button')!;
    expect(describeElement(button)).toBe('<button type="submit" aria-label="Gọi [redacted]" class="px-2 py-1">');
    expect(elementText(button)).toBe('Gọi [redacted]');
    expect(controlValue(document.querySelector('input')!)).toBe('[redacted]');
    expect(controlValue(button)).toBeNull();
  });
});
