import { afterEach, describe, expect, it, vi } from 'vitest';

import { elementsInArea, pauseMotion } from './page-tools';

afterEach(() => {
  document.body.innerHTML = '';
});

/** jsdom has no layout: give each element the box it would have. */
function place(selector: string, left: number, top: number, width: number, height: number): void {
  const element = document.querySelector(selector)!;
  element.getBoundingClientRect = () =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
}

describe('elementsInArea', () => {
  it('returns the smallest container of the area and the outermost elements wholly inside it', () => {
    document.body.innerHTML =
      '<main><section id="card"><b id="a"><i>x</i></b><b id="b"></b><b id="c"></b></section></main><div data-dev-annotator><p></p></div>';
    place('body', 0, 0, 1000, 1000);
    place('main', 0, 0, 1000, 800);
    place('#card', 100, 100, 400, 300);
    place('#a', 110, 110, 50, 20);
    place('#a i', 112, 112, 10, 10);
    place('#b', 200, 110, 50, 20);
    place('#c', 450, 380, 100, 50);
    place('[data-dev-annotator] p', 120, 120, 10, 10);

    const { container, inside } = elementsInArea(document, { x: 105, y: 105, width: 200, height: 50 });
    expect(container.id).toBe('card');
    expect(inside.map((element) => element.id)).toEqual(['a', 'b']);
  });

  it('names the content holding the area, not a background laid across it, and skips decoration', () => {
    document.body.innerHTML =
      '<section id="hero"><svg id="grid"><rect id="cell"></rect></svg><div id="col"><ul id="list"><li id="one"></li><li id="two"></li></ul><i aria-hidden="true" id="icon"></i></div></section>';
    place('body', 0, 0, 1000, 1000);
    place('#hero', 0, 0, 1000, 600);
    // The pattern covers everything and comes later than nothing: it must still lose.
    place('#grid', 0, 0, 1000, 600);
    place('#cell', 0, 0, 1000, 600);
    place('#col', 100, 100, 400, 400);
    place('#list', 120, 120, 200, 100);
    place('#one', 120, 120, 200, 40);
    place('#two', 120, 170, 200, 40);
    place('#icon', 150, 230, 10, 10);

    const { container, inside } = elementsInArea(document, { x: 110, y: 110, width: 260, height: 140 });
    expect(container.id).toBe('col');
    expect(inside.map((element) => element.id)).toEqual(['list']);
  });
});

describe('pauseMotion', () => {
  it('pauses only what is running and resumes exactly that', () => {
    const running = { playState: 'running', pause: vi.fn(), play: vi.fn() };
    const finished = { playState: 'finished', pause: vi.fn(), play: vi.fn() };
    const doc = Object.assign(document, { getAnimations: () => [running, finished] as unknown as Animation[] });
    const resume = pauseMotion(doc);
    expect(running.pause).toHaveBeenCalledOnce();
    expect(finished.pause).not.toHaveBeenCalled();
    resume();
    expect(running.play).toHaveBeenCalledOnce();
    expect(finished.play).not.toHaveBeenCalled();
  });
});
