import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevAnnotator } from './annotator';
import { CaptureCancelled, type ScreenCapture } from './screenshot';
import type { FrameResolver } from './stack';

const resolveFrames: FrameResolver = async (frames) =>
  frames.map((frame) => ({ file: 'src/page.tsx', line: frame.line1, column: null, mapped: true }));

function Counter(): ReactNode {
  const [count, setCount] = useState(0);
  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      Đếm {count}
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

async function addComment(user: ReturnType<typeof userEvent.setup>, target: string, comment: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: target }));
  await user.type(screen.getByPlaceholderText('What should change here?'), comment);
  await user.click(screen.getByRole('button', { name: /Save/ }));
}

describe('DevAnnotator', () => {
  it('in comment mode, a click pins a comment instead of reaching the page, and the prompt names it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" appDir="apps/backoffice" resolveFrames={resolveFrames} />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Đếm 0' }));
    expect(screen.getByRole('button', { name: 'Đếm 1' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await addComment(user, 'Đếm 1', 'Chữ phải đậm hơn');
    // The page never saw that click: still 1.
    expect(screen.getByRole('button', { name: 'Đếm 1' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Comment 1' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const prompt = writeText.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('## 1. Chữ phải đậm hơn');
    expect(prompt).toContain('**Components, nearest first:** `Counter`');
    expect(prompt).toContain('apps/backoffice/src/page.tsx');
    expect(prompt).toContain('**Data of `Counter`**');
    expect(prompt).toContain('"state": [\n    1\n  ]');
  });

  it('Alt+click lets an interaction through while comment mode is on', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.keyboard('{Alt>}{Shift>}C{/Shift}{/Alt}');
    expect(screen.getByRole('status').textContent).toContain('Comment mode');
    await user.keyboard('{Alt>}');
    await user.click(screen.getByRole('button', { name: 'Đếm 0' }));
    await user.keyboard('{/Alt}');
    expect(screen.getByRole('button', { name: 'Đếm 1' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hides the hint until asked for it again, and remembers that across a remount', async () => {
    const user = userEvent.setup();
    const view = render(<DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />);
    await user.keyboard('{Alt>}{Shift>}C{/Shift}{/Alt}');
    await user.click(screen.getByRole('button', { name: 'Hide hint' }));
    expect(screen.queryByRole('status')).toBeNull();

    view.unmount();
    render(<DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />);
    await user.keyboard('{Alt>}{Shift>}C{/Shift}{/Alt}');
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show hint' }));
    expect(screen.getByRole('status').textContent).toContain('Comment mode');
    expect(screen.queryByRole('button', { name: 'Show hint' })).toBeNull();
  });

  it('Ctrl+click gathers several elements, and releasing Ctrl opens one editor for all of them', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <>
        <p>Dư nợ gốc</p>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Dư nợ gốc'));
    await user.click(screen.getByRole('button', { name: 'Đếm 0' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{/Control}');

    await user.type(screen.getByPlaceholderText('What should change here?'), 'Căn thẳng hàng');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const prompt = writeText.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('The comment applies to ALL of the elements below.');
    expect(prompt).toContain('### 1.1 Element 1');
    expect(prompt).toContain('text "Dư nợ gốc"');
    expect(prompt).toContain('### 1.2 Element 2');
    expect(prompt).toContain('text "Đếm 0"');
  });

  it('a text selection becomes a comment on that passage', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <>
        <p>Liên hệ 0912345678 để được hỗ trợ</p>
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    const paragraph = screen.getByText(/Liên hệ/);
    window.getSelection()?.selectAllChildren(paragraph);
    fireEvent.mouseUp(paragraph);

    await user.type(await screen.findByPlaceholderText('What should change here?'), 'Viết lại câu này');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy prompt' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain('- **Selected text:** "Liên hệ [redacted] để được hỗ trợ"');
  });

  it('keeps comments across a remount through sessionStorage, and the pin finds its element again', async () => {
    const user = userEvent.setup();
    const page = (
      <>
        <Counter />
        <DevAnnotator appName="portal" resolveFrames={resolveFrames} />
      </>
    );
    const first = render(page);
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await addComment(user, 'Đếm 0', 'A');
    await screen.findByRole('button', { name: 'Comment 1' });
    // A reload: the whole tree goes, including the container RTL would otherwise leave behind.
    first.unmount();
    first.container.remove();

    render(page);
    expect(screen.getByRole('button', { name: 'Comment list (1)' })).toBeTruthy();
    // The page's DOM is committed after the overlay's first render; the pin lands on the next reflow tick.
    expect(await screen.findByRole('button', { name: 'Comment 1' })).toBeTruthy();
  });

  it('says the prompt is ready to paste, and has no "open file" button', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await user.click(screen.getByRole('button', { name: 'Đếm 0' }));
    expect(screen.queryByRole('button', { name: /Open file/ })).toBeNull();
    await user.type(screen.getByPlaceholderText('What should change here?'), 'A');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    await user.click(await screen.findByRole('button', { name: 'Copy prompt' }));
    expect((await screen.findByText('Prompt copied — ready for your coding agent')).closest('[role="status"]')).toBeTruthy();
    expect(screen.getByText(/behind your comment\./)).toBeTruthy();
  });

  it('captures with only the comments on screen, then opens the editor; only Close closes it, and comment mode stays on', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const user = userEvent.setup();
    const seen: { toolbar: boolean; callout: boolean }[] = [];
    const captureScreen: ScreenCapture = async (prepare) => {
      await prepare();
      seen.push({
        toolbar: screen.queryByRole('toolbar', { name: 'Dev annotator' }) !== null,
        callout: screen.queryByRole('button', { name: 'Comment 1: Chữ phải đậm hơn' }) !== null,
      });
      return Object.assign(document.createElement('canvas'), { width: 800, height: 500 });
    };
    render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} captureScreen={captureScreen} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await addComment(user, 'Đếm 0', 'Chữ phải đậm hơn');
    await screen.findByRole('button', { name: 'Comment 1' });

    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    expect(await screen.findByRole('dialog', { name: 'Screenshot editor' })).toBeTruthy();
    expect(seen).toEqual([{ toolbar: false, callout: true }]);
    // Back to numbered pins once the capture is taken.
    expect(screen.getByRole('button', { name: 'Comment 1' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('t');
    expect(screen.getByRole('button', { name: 'Callout' }).getAttribute('aria-pressed')).toBe('true');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Screenshot editor' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Screenshot editor' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Turn off comment mode' })).toBeTruthy();
  });

  it('says so when the capture is refused', async () => {
    const user = userEvent.setup();
    render(<DevAnnotator appName="backoffice" resolveFrames={resolveFrames} captureScreen={() => Promise.reject(new CaptureCancelled())} />);
    await user.click(screen.getByRole('button', { name: 'Screenshot' }));
    expect(await screen.findByText('Screenshot cancelled')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows every comment in full instead of numbers, and remembers the choice', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await addComment(user, 'Đếm 0', 'Căn giữa');
    await user.click(await screen.findByRole('button', { name: 'Show comments in full' }));
    expect(screen.getByRole('button', { name: 'Comment 1: Căn giữa' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Comment 1' })).toBeNull();
    expect(window.localStorage.getItem('agent-annotator:show-comments')).toBe('1');
  });

  it('draws a commented area back where it was marked, riding on its container', async () => {
    const user = userEvent.setup();
    render(
      <>
        <section id="card">
          <Counter />
        </section>
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    const card = document.getElementById('card')!;
    let offsetTop = 100;
    card.getBoundingClientRect = () =>
      ({ left: 100, top: offsetTop, width: 400, height: 300, right: 500, bottom: offsetTop + 300, x: 100, y: offsetTop }) as DOMRect;
    // jsdom has no hit testing: the content under the area's centre is the card.
    Object.assign(document, { elementsFromPoint: () => [card] });
    document.body.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0 }) as DOMRect;

    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    fireEvent.mouseDown(card, { clientX: 150, clientY: 150, shiftKey: true });
    fireEvent.mouseUp(card, { clientX: 250, clientY: 200, shiftKey: true });
    await user.type(screen.getByPlaceholderText('What should change here?'), 'Spacing');
    await user.click(screen.getByRole('button', { name: /Save/ }));
    await user.click(await screen.findByRole('button', { name: 'Show comments in full' }));

    // The page scrolls up 40px: the area moves with its container.
    offsetTop = 60;
    fireEvent.scroll(window);
    const outline = screen.getByRole('button', { name: 'Comment 1: Spacing' }).previousElementSibling as HTMLElement;
    await waitFor(() => expect(outline.style.top).toBe('110px'));
    expect(outline.style.left).toBe('150px');
    expect(outline.style.width).toBe('100px');
    expect(outline.style.borderStyle ?? outline.style.border).toContain('dashed');
    Reflect.deleteProperty(document, 'elementsFromPoint');
  });

  it('explains every toolbar button in a tooltip, with its shortcut', async () => {
    const user = userEvent.setup();
    render(<DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />);
    await user.hover(screen.getByRole('button', { name: 'Turn on comment mode' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Turn on comment mode');
    expect(tip.textContent).toMatch(/Shift.*C/);
    await user.unhover(screen.getByRole('button', { name: 'Turn on comment mode' }));
    // Disabled while there is nothing to copy, and the tip says why.
    await user.hover(screen.getByRole('button', { name: 'Copy prompt' }));
    expect((await screen.findByRole('tooltip')).textContent).toContain('Add a comment first.');
  });

  it('collapses the toolbar to one button that keeps the count, and remembers it', async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <Counter />
        <DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Turn on comment mode/ }));
    await addComment(user, 'Đếm 0', 'A');
    await user.click(await screen.findByRole('button', { name: 'Collapse toolbar' }));
    expect(screen.queryByRole('button', { name: 'Copy prompt' })).toBeNull();
    expect(screen.queryByLabelText('Comment list')).toBeNull();
    const expand = screen.getByRole('button', { name: 'Expand toolbar' });
    expect(expand.textContent).toContain('1');

    // Still collapsed after a reload.
    view.unmount();
    render(<DevAnnotator appName="backoffice" resolveFrames={resolveFrames} />);
    await user.click(screen.getByRole('button', { name: 'Expand toolbar' }));
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeTruthy();
    expect(window.localStorage.getItem('agent-annotator:toolbar-collapsed')).toBeNull();
  });
});
