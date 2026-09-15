import { describe, it, expect } from 'vitest';
import { formatJson } from '../src/scene/roomFile.js';
import { SAVED_ROOM } from '../src/scene/spec.js';

describe('writing room.json', () => {
  const text = formatJson(SAVED_ROOM);

  it('round-trips exactly', () => {
    expect(JSON.parse(text)).toEqual(SAVED_ROOM);
  });

  it('keeps each opening on its own line, like the hand-written file', () => {
    expect(text).toContain('{ "type": "window", "left": 0.517, "width": 1.2, "sill": 0.9, "head": 2.85 }');
    expect(text).toContain('"clear": { "length": 11.4, "width": 3.95, "height": 3.1 }');
  });

  it('leaves commas and colons inside strings alone', () => {
    expect(text).toContain('"name": "Burgas"');
  });

  it('ends with a newline and writes empty lists compactly', () => {
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('"partitions": []');
  });

  it('keeps short records with coordinate lists on one line too', () => {
    expect(text).toContain('{ "id": "back", "side": "-x", "finish": "plaster", "openings": [] }');
    expect(text).toContain('{ "size": [0.04, 2.45, 0.05], "at": [5.61, 1.35, -1.875] }');
    expect(text).toContain('        [-4.3, -0.95],');
  });
});
