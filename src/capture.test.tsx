import { act, lazy, Suspense, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { captureElement, hoverLabel } from './capture';
import type { FrameResolver } from './stack';

// A real React tree, rendered by react-dom in development mode: the fiber walk is only
// worth testing against what React itself builds.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function DebtorField(props: { readonly label: string; readonly phone: string; readonly amount: string }): ReactNode {
  const [open] = useState(false);
  const [count] = useState(3);
  return (
    <div>
      <span>{props.label}</span>
      <button type="button" aria-expanded={open}>
        Gọi {props.phone} ({count})
      </button>
      <output>{props.amount}</output>
    </div>
  );
}

function LoanCard(): ReactNode {
  const [loan] = useState({ code: 'L-001', borrowerName: 'Nguyễn Văn A', outstanding: '150000000' });
  return (
    <section>
      <DebtorField label="Người vay" phone="0912345678" amount={loan.outstanding} />
    </section>
  );
}

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(node: ReactNode): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

/** Resolves every frame to its own bundled location, as the real resolver does when Next is absent. */
const identity: FrameResolver = async (frames) =>
  frames.map((frame) => ({ file: frame.file, line: frame.line1, column: frame.column1, mapped: false }));

function button(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector('button');
  if (found === null) throw new Error('no button rendered');
  return found;
}

describe('captureElement on a live React tree', () => {
  it('names the enclosing components nearest first and locates each JSX call site in this file', async () => {
    const capture = await captureElement(button(render(<LoanCard />)), identity);

    expect(capture.components.map((component) => component.name)).toEqual(['DebtorField', 'LoanCard']);
    // The <button> is written inside DebtorField, which LoanCard renders further down.
    expect(capture.jsx?.file).toMatch(/capture\.test\.tsx$/);
    expect(capture.components[0]?.renderedAt?.file).toMatch(/capture\.test\.tsx$/);
    expect(capture.jsx?.line).toBeLessThan(capture.components[0]?.renderedAt?.line ?? 0);
  });

  it("snapshots the nearest components' props and stateful hooks with personal data screened", async () => {
    const capture = await captureElement(button(render(<LoanCard />)), identity);

    expect(capture.data).toEqual([
      {
        component: 'DebtorField',
        props: { label: 'Người vay', phone: '[redacted]', amount: '150000000' },
        state: [false, 3],
      },
      {
        component: 'LoanCard',
        props: {},
        state: [{ code: 'L-001', borrowerName: '[redacted]', outstanding: '150000000' }],
      },
    ]);
    expect(capture.element.text).toBe('Gọi [redacted] (3)');
    expect(capture.element.opening).toBe('<button type="button">');
    expect(capture.page.pathname).toBe('/');
  });

  it('labels the hover with the nearest component', () => {
    const container = render(<LoanCard />);
    const output = container.querySelector('output');
    expect(output === null ? null : hoverLabel(output)).toBe('DebtorField · output');
    expect(hoverLabel(document.body)).toBe('body');
  });

  it('names a component loaded through React.lazy, as Next 14 loads client components', async () => {
    const LazyDebtorField = lazy(async () => ({ default: DebtorField }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <Suspense fallback={null}>
          <LazyDebtorField label="Người vay" phone="0912345678" amount="1" />
        </Suspense>,
      );
    });

    const capture = await captureElement(button(container), identity);
    expect(capture.components[0]?.name).toBe('DebtorField');
    expect(hoverLabel(button(container))).toBe('DebtorField · button');
  });
});
