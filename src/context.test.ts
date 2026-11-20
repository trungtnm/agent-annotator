import { afterEach, describe, expect, it } from 'vitest';

import { describeAccessibility, nearbyText, sectionPath } from './context';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('accessibility description', () => {
  it('gives role, accessible name and states, screening personal data', () => {
    document.body.innerHTML = `
      <button disabled aria-expanded="false">Gọi 0912345678</button>
      <label for="code">Mã hợp đồng</label><input id="code">
      <div>plain</div>`;
    expect(describeAccessibility(document.querySelector('button')!)).toBe(
      'button "Gọi [redacted]" (disabled, aria-expanded=false)',
    );
    expect(describeAccessibility(document.querySelector('input')!)).toBe('textbox "Mã hợp đồng"');
    expect(describeAccessibility(document.querySelector('div')!)).toBeNull();
  });
});

describe('section path', () => {
  it('names the page heading and the labelled sections around the element, outermost first', () => {
    document.body.innerHTML = `
      <h1>Lô nợ</h1>
      <div role="dialog" aria-label="Tạo lô nợ">
        <fieldset><legend>Tệp nguồn</legend><button>Chọn tệp</button></fieldset>
      </div>`;
    expect(sectionPath(document.querySelector('button')!)).toBe('Lô nợ › Tạo lô nợ › Tệp nguồn');
  });

  it('tells identical buttons apart by their neighbours', () => {
    document.body.innerHTML = '<div><span>Hợp đồng A</span><button>Xem</button><span>12/2026</span></div>';
    expect(nearbyText(document.querySelector('button')!)).toBe('before: "Hợp đồng A" · after: "12/2026"');
  });
});
