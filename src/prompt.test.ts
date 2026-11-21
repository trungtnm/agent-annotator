import { describe, expect, it } from 'vitest';

import type { ElementCapture } from './capture';
import { buildPrompt, repoPath, type Annotation } from './prompt';

const jsx = { file: 'src/components/save-bar.tsx', line: 42, column: 7, mapped: true };

const capture: ElementCapture = {
  page: { url: 'http://localhost:5174/loans/7?tab=docs', pathname: '/loans/7', search: '?tab=docs', title: 'Khoản vay' },
  element: {
    tag: 'button',
    opening: '<button type="submit">',
    selector: '#content > button',
    text: 'Lưu',
    value: null,
    rect: { x: 10, y: 20, width: 80, height: 32 },
    styles: { 'font-size': '14px', color: 'rgb(0, 0, 0)' },
    accessibility: 'button "Lưu" (disabled)',
    section: 'Khoản vay › Hồ sơ',
    nearby: null,
  },
  viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
  jsx,
  components: [
    { name: 'SaveBar', renderedAt: { file: 'src/app/(shell)/loans/[id]/page.tsx', line: 88, column: 5, mapped: true } },
    { name: 'LoanPage', renderedAt: null },
  ],
  data: [{ component: 'SaveBar', props: { disabled: false, phone: '[redacted]' }, state: [true] }],
};

const annotation: Annotation = {
  id: 'a',
  kind: 'element',
  comment: 'Nút này phải màu đỏ\nvà rộng hơn',
  createdAt: '2026-11-20T03:00:00Z',
  targets: [capture],
};

describe('buildPrompt', () => {
  const options = {
    appName: 'backoffice',
    appDir: 'apps/backoffice',
    includeData: true,
    now: new Date(2026, 10, 20, 10, 5),
  };

  it('gives the agent the comment, the page, and source paths from the repo root', () => {
    const prompt = buildPrompt([annotation], options);
    expect(prompt).toContain('# Change requests: backoffice (1 comment)');
    expect(prompt).toContain('Dev environment http://localhost:5174, recorded 2026-11-20 10:05.');
    expect(prompt).toContain('## 1. Nút này phải màu đỏ\n\n> Nút này phải màu đỏ\n> và rộng hơn');
    expect(prompt).toContain('- **Page:** `/loans/7?tab=docs`, title "Khoản vay"');
    expect(prompt).toContain('- **Element JSX:** `apps/backoffice/src/components/save-bar.tsx:42:7`');
    expect(prompt).toContain(
      '- **Components, nearest first:** `SaveBar` (rendered at `apps/backoffice/src/app/(shell)/loans/[id]/page.tsx:88:5`) ← `LoanPage`',
    );
    expect(prompt).toContain('"phone": "[redacted]"');
    expect(prompt).toContain('- **Role (a11y):** button "Lưu" (disabled)');
    expect(prompt).toContain('- **Section:** Khoản vay › Hồ sơ');
  });

  it('claims redaction only for the comments that were screened', () => {
    const note = 'Personal data has been replaced with `[redacted]`';
    expect(buildPrompt([annotation], options)).toContain(`${note}; never treat it as a real value.`);
    const raw = { ...annotation, redacted: false };
    expect(buildPrompt([annotation, raw], options)).toContain(
      `${note} (except in comment 2, recorded with redaction off); never treat it as a real value.`,
    );
    expect(buildPrompt([raw, raw], options)).not.toContain(note);
  });

  it('writes one sub-section per element for a group, and names the container of an area', () => {
    const second: ElementCapture = { ...capture, element: { ...capture.element, text: 'Huỷ' } };
    const group = buildPrompt([{ ...annotation, kind: 'group', targets: [capture, second] }], options);
    expect(group).toContain('- **Kind:** The comment applies to ALL of the elements below.');
    expect(group).toContain('### 1.1 Element 1');
    expect(group).toContain('### 1.2 Element 2');
    expect(group).toContain('text "Huỷ"');

    const area = buildPrompt(
      [{ ...annotation, kind: 'area', targets: [capture], area: { x: 5, y: 6, width: 100, height: 40 } }],
      options,
    );
    expect(area).toContain('- **Area:** 100×40 at (5, 6) in the viewport');
    expect(area).toContain('### 1.1 Container');
    const inside = buildPrompt(
      [{ ...annotation, kind: 'area', targets: [capture, capture], area: { x: 5, y: 6, width: 100, height: 40 } }],
      options,
    );
    expect(inside).toContain('### 1.2 Inside the area 1');
    expect(area).toContain('empty space within the container');
  });

  it('quotes a selected passage', () => {
    const prompt = buildPrompt([{ ...annotation, kind: 'text', selectedText: 'Dư nợ gốc' }], options);
    expect(prompt).toContain('- **Selected text:** "Dư nợ gốc"');
  });

  it('leaves the data out when asked, and flags a line that is only the bundled one', () => {
    const unmapped: Annotation = { ...annotation, targets: [{ ...capture, jsx: { ...jsx, mapped: false } }] };
    const prompt = buildPrompt([unmapped], { ...options, includeData: false });
    expect(prompt).not.toContain('```json');
    expect(prompt).toContain('save-bar.tsx:42:7` (line in the bundled output, approximate)');
  });
});

describe('repoPath', () => {
  it('prefixes app-relative paths and collapses parent segments', () => {
    expect(repoPath('src/x.tsx', 'apps/backoffice')).toBe('apps/backoffice/src/x.tsx');
    expect(repoPath('../../node_modules/x/y.js', 'apps/backoffice')).toBe('node_modules/x/y.js');
    expect(repoPath('http://localhost:5174/a.js', 'apps/backoffice')).toBe('http://localhost:5174/a.js');
    expect(repoPath('src/x.tsx', undefined)).toBe('src/x.tsx');
    expect(repoPath('/Users/a/my-repo/apps/debtor-portal/src/x.tsx', 'apps/debtor-portal')).toBe(
      'apps/debtor-portal/src/x.tsx',
    );
    expect(repoPath('/Users/a/my-repo/packages/ui/x.tsx', 'apps/debtor-portal')).toBe('/Users/a/my-repo/packages/ui/x.tsx');
  });
});
