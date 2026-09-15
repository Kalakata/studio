// Undo/redo over layout snapshots (plain item arrays). No three.js; tested in node.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createHistory(limit = 100) {
  let past = [], future = [], current = null;

  return {
    // start over from this state, e.g. on load
    reset(state) { current = state; past = []; future = []; },

    // a new state after an edit; identical states are ignored, so re-recording the state an
    // undo just restored is harmless
    record(state) {
      if (current !== null && same(current, state)) return false;
      if (current !== null) past.push(current);
      if (past.length > limit) past.shift();
      current = state;
      future = [];
      return true;
    },

    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return current;
    },

    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return current;
    },

    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; }
  };
}
