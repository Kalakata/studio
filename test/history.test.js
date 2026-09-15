import { describe, it, expect } from 'vitest';
import { createHistory } from '../src/assets/history.js';

const s = (n) => [{ type: 'desk', x: n, z: 0, ry: 0 }];

describe('undo history', () => {
  it('undoes and redoes in order', () => {
    const h = createHistory();
    h.reset(s(0));
    h.record(s(1));
    h.record(s(2));
    expect(h.undo()).toEqual(s(1));
    expect(h.undo()).toEqual(s(0));
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual(s(1));
    expect(h.redo()).toEqual(s(2));
    expect(h.redo()).toBeNull();
  });

  it('a new edit after undo drops the redo branch', () => {
    const h = createHistory();
    h.reset(s(0));
    h.record(s(1));
    h.undo();
    h.record(s(5));
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toEqual(s(0));
  });

  it('re-recording the state just restored is not a new step', () => {
    const h = createHistory();
    h.reset(s(0));
    h.record(s(1));
    const restored = h.undo();
    expect(h.record(restored)).toBe(false);
    expect(h.canRedo).toBe(true);
  });

  it('keeps at most `limit` steps', () => {
    const h = createHistory(3);
    h.reset(s(0));
    for (let i = 1; i <= 10; i++) h.record(s(i));
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(3);
  });
});
