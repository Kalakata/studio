import { describe, it, expect } from 'vitest';
import { createStore, parseLayout, exportLayout, normalize, sameItems, FORMAT } from '../src/assets/layouts.js';
import defaultLayout from '../src/assets/layout.json';
import catalog from '../src/assets/catalog.json';

const known = new Set(catalog.assets.map((a) => a.id));

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const A = [{ type: 'desk', x: 5.34, z: 0, ry: -90 }, { type: 'sofa', x: 0.6, z: 1.495, ry: -180 }];
const B = [{ type: 'rug', x: -2, z: 0.1, ry: 45 }];

describe('layout store', () => {
  it('saves two named layouts, switches between them, and survives a reload', () => {
    const storage = fakeStorage();
    const s = createStore(storage);
    s.save('Desk at street', A);
    s.save('Rug only', B);
    s.setWorking(B, 'Rug only');

    const reloaded = createStore(storage);
    expect(reloaded.names()).toEqual(['Desk at street', 'Rug only']);
    expect(reloaded.get('Desk at street')).toEqual(A);
    expect(reloaded.get('Rug only')).toEqual(B);
    expect(reloaded.working).toEqual({ items: B, base: 'Rug only' });
  });

  it('rename and delete keep the working base honest', () => {
    const s = createStore(fakeStorage());
    s.save('One', A);
    s.setWorking(A, 'One');
    s.rename('One', 'Two');
    expect(s.has('One')).toBe(false);
    expect(s.working.base).toBe('Two');
    s.remove('Two');
    expect(s.names()).toEqual([]);
    expect(s.working.base).toBe(null);
  });

  it('suggests a free name', () => {
    const s = createStore(fakeStorage());
    s.save('Layout', A);
    s.save('Layout (2)', A);
    expect(s.uniqueName('Layout')).toBe('Layout (3)');
    expect(s.uniqueName('Other')).toBe('Other');
  });

  it('keeps working in memory when storage throws', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const s = createStore(broken);
    s.save('X', A);
    expect(s.get('X')).toEqual(A);
    const none = createStore(null);
    none.save('Y', B);
    expect(none.get('Y')).toEqual(B);
  });

  it('ignores a corrupt stored value', () => {
    const storage = fakeStorage();
    storage.setItem('studio.layouts.v1', '{not json');
    expect(createStore(storage).names()).toEqual([]);
  });
});

describe('export and import', () => {
  it('round-trips through a JSON file', () => {
    const file = JSON.stringify(exportLayout('Desk at street', A), null, 2);
    const parsed = parseLayout(JSON.parse(file), known);
    expect(parsed.name).toBe('Desk at street');
    expect(parsed.items).toEqual(A);
    expect(parsed.dropped).toBe(0);
    expect(JSON.parse(file).format).toBe(FORMAT);
  });

  it('reads the shipped default layout', () => {
    const parsed = parseLayout(defaultLayout, known);
    expect(parsed.items).toHaveLength(17);
    expect(parsed.dropped).toBe(0);
  });

  it('skips unknown pieces but keeps the rest', () => {
    const parsed = parseLayout({ items: [...A, { type: 'piano', x: 0, z: 0 }] }, known);
    expect(parsed.items).toEqual(A);
    expect(parsed.dropped).toBe(1);
  });

  it('rejects files that are not layouts', () => {
    expect(() => parseLayout({ hello: 1 }, known)).toThrow(/not a layout/);
    expect(() => parseLayout({ items: [{ type: 'desk', x: 'left' }] }, known)).toThrow(/malformed/);
    expect(() => parseLayout({ format: 'something-else', items: [] }, known)).toThrow(/unknown format/);
  });
});

describe('normalize', () => {
  it('treats 180 and -180 as the same rotation, and ignores sub-0.1 mm noise', () => {
    const a = normalize([{ type: 'sofa', x: 0.6, z: 1.495, ry: 180 }]);
    const b = normalize([{ type: 'sofa', x: 0.60000000001, z: 1.49499999, ry: -180 }]);
    expect(sameItems(a, b)).toBe(true);
  });
});
