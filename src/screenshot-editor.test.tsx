import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenshotEditor } from './screenshot-editor';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  // jsdom implements neither; the editor only needs them to exist.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function open(onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn>; canvas: HTMLCanvasElement } {
  const image = Object.assign(document.createElement('canvas'), { width: 800, height: 400 });
  render(<ScreenshotEditor image={image} fileName="shot.png" onClose={onClose} onNotice={vi.fn()} />);
  const canvas = screen.getByRole('dialog').querySelector('canvas')!;
  // jsdom has no layout: the canvas shows at its image size, at (0, 0).
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400, x: 0, y: 0 }) as DOMRect;
  return { onClose, canvas };
}

function drag(canvas: HTMLCanvasElement, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(canvas, { button: 0, clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

describe('ScreenshotEditor', () => {
  it('shows a tooltip with the shortcut on hover', async () => {
    const user = userEvent.setup();
    open();
    await user.hover(screen.getByRole('button', { name: 'Rectangle' }));
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toContain('Rectangle');
    expect(tip.textContent).toContain('R');
    expect(screen.getByRole('button', { name: 'Rectangle' }).getAttribute('aria-describedby')).toBe(tip.id);
    await user.unhover(screen.getByRole('button', { name: 'Rectangle' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('never closes on Esc, and asks before discarding marks', async () => {
    const user = userEvent.setup();
    const { onClose, canvas } = open();
    drag(canvas, [10, 10], [200, 120]);
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discard marks and close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('selects a mark, moves it, undoes and redoes the move, then deletes it', async () => {
    const user = userEvent.setup();
    const { canvas } = open();
    drag(canvas, [100, 100], [200, 160]);
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    const remove = screen.getByRole('button', { name: 'Delete selected' }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(remove.disabled).toBe(true);

    await user.keyboard('v');
    drag(canvas, [150, 130], [300, 230]);
    expect(remove.disabled).toBe(false);
    // The rectangle moved: grabbing its old spot now selects nothing.
    drag(canvas, [120, 110], [120, 110]);
    expect(remove.disabled).toBe(true);
    drag(canvas, [270, 220], [270, 220]);
    expect(remove.disabled).toBe(false);

    await user.keyboard('{Meta>}z{/Meta}');
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    await user.keyboard('{Backspace}');
    expect(remove.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    drag(canvas, [270, 220], [270, 220]);
    expect(remove.disabled).toBe(false);
  });

  it('zooms in steps and back to fit, and offers a custom colour', async () => {
    const user = userEvent.setup();
    open();
    const label = (): string => screen.getByRole('button', { name: /^Zoom \d+%$/ }).textContent ?? '';
    const start = label();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(label()).not.toBe(start);
    await user.click(screen.getByRole('button', { name: 'Fit to window' }));
    expect(label()).toBe(start);
    await act(async () => {
      await user.keyboard('{Meta>}={/Meta}');
    });
    expect(label()).not.toBe(start);

    const custom = screen.getByLabelText('Custom colour') as HTMLInputElement;
    expect(custom.type).toBe('color');
    fireEvent.input(custom, { target: { value: '#123456' } });
    fireEvent.change(custom, { target: { value: '#123456' } });
    expect(screen.getAllByRole('button', { pressed: true }).some((button) => /Colour/.test(button.getAttribute('aria-label') ?? ''))).toBe(false);
  });

  it('crops on release, and undo or Reset crop gives the whole image back', async () => {
    const user = userEvent.setup();
    const { canvas } = open();
    // The canvas is the board: the picture plus a 12px margin on each side here (jsdom has
    // no scroll area for it to fill).
    const margin = 24;
    await user.keyboard('c');
    drag(canvas, [100, 50], [500, 250]);
    expect(canvas.width - margin).toBe(400);
    expect(canvas.height - margin).toBe(200);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(canvas.width - margin).toBe(800);
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(canvas.width - margin).toBe(400);
    await user.click(screen.getByRole('button', { name: 'Reset crop' }));
    expect(canvas.width - margin).toBe(800);
  });

  it('makes a callout with a tail from one drag, and a plain box from a click', async () => {
    const user = userEvent.setup();
    const { canvas } = open();
    await user.keyboard('t');
    drag(canvas, [100, 300], [400, 100]);
    const input = await screen.findByLabelText('Callout text');
    await user.type(input, 'Too tight{Enter}');
    expect(screen.queryByLabelText('Callout text')).toBeNull();

    // Selected by its tail as well as by its box.
    await user.keyboard('v');
    drag(canvas, [130, 280], [130, 280]);
    expect((screen.getByRole('button', { name: 'Delete selected' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps a drag whose events arrive faster than React renders', () => {
    const { canvas } = open();
    // One act: no render between the events, as with a quick flick on a trackpad.
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 50, clientY: 50 }));
      canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 200 }));
      canvas.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 300, clientY: 200 }));
    });
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('teaches the callout drag where it is needed, nudges after a plain click, and goes once learned', async () => {
    const user = userEvent.setup();
    const { canvas } = open();
    expect(screen.queryByRole('note', { name: 'Callout tip' })).toBeNull();

    await user.keyboard('t');
    expect(screen.getByRole('note', { name: 'Callout tip' }).textContent).toContain('Drag to point at something');

    // A plain click still makes a box — and the tip turns into a nudge.
    drag(canvas, [200, 200], [200, 200]);
    await user.type(await screen.findByLabelText('Callout text'), 'Label{Enter}');
    expect(screen.getByRole('note', { name: 'Callout tip' }).textContent).toContain('Tip: drag instead of clicking');

    // The first real drag is the lesson learned: the tip is gone, now and next time.
    drag(canvas, [100, 300], [400, 100]);
    expect(screen.queryByRole('note', { name: 'Callout tip' })).toBeNull();
    expect(window.localStorage.getItem('agent-annotator:callout-tip-done')).toBe('1');
  });

  it('lets "Got it" put the tip away for good', async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard('t');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note', { name: 'Callout tip' })).toBeNull();
    cleanup();
    open();
    await user.keyboard('t');
    expect(screen.queryByRole('note', { name: 'Callout tip' })).toBeNull();
  });

  it('grows the picture to hold a mark drawn past its edge, and back when it goes', async () => {
    const user = userEvent.setup();
    const { canvas } = open();
    const before = canvas.width;
    // A rectangle that starts inside and ends 200px past the right edge.
    drag(canvas, [700, 100], [1000, 200]);
    expect(canvas.width).toBeGreaterThan(before + 200);
    await user.keyboard('{Meta>}z{/Meta}');
    expect(canvas.width).toBe(before);
  });
});
