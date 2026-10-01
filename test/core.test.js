import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Emitter } from '../src/index.js';

// ---- happy path: on, emit, returns true/false ----

test('on registers a listener called with the emitted payload', () => {
  const e = new Emitter();
  const seen = [];
  e.on('ping', (v) => { seen.push(v); });
  const heard = e.emit('ping', 42);
  assert.equal(heard, true);
  assert.deepEqual(seen, [42]);
});

test('emit returns false when no listeners are registered', () => {
  const e = new Emitter();
  assert.equal(e.emit('nope', null), false);
});

test('multiple listeners fire in insertion order', () => {
  const e = new Emitter();
  const order = [];
  e.on('x', () => order.push(1));
  e.on('x', () => order.push(2));
  e.on('x', () => order.push(3));
  e.emit('x');
  assert.deepEqual(order, [1, 2, 3]);
});

// ---- once semantics ----

test('once listeners fire exactly once across multiple emits', () => {
  const e = new Emitter();
  let calls = 0;
  e.once('boom', () => { calls++; });
  e.emit('boom');
  e.emit('boom');
  e.emit('boom');
  assert.equal(calls, 1);
});

test('once listener is removed before invocation, so it can re-add itself', () => {
  // This is the documented edge: once removal happens before the body runs,
  // so a body that calls on() for the same listener is not immediately undone.
  const e = new Emitter();
  let calls = 0;
  const handler = () => {
    calls++;
    if (calls < 3) e.once('tick', handler);
  };
  e.once('tick', handler);
  e.emit('tick');
  e.emit('tick');
  e.emit('tick');
  e.emit('tick'); // fourth emit: handler re-added on the 2nd, not the 3rd
  assert.equal(calls, 3);
});

test('once and on listeners coexist on the same event', () => {
  const e = new Emitter();
  const log = [];
  e.on('e', () => log.push('persistent'));
  e.once('e', () => log.push('once'));
  e.emit('e');
  e.emit('e');
  assert.deepEqual(log, ['persistent', 'once', 'persistent']);
});

// ---- off semantics ----

test('off removes a specific listener', () => {
  const e = new Emitter();
  let calls = 0;
  const fn = () => { calls++; };
  e.on('a', fn);
  e.off('a', fn);
  e.emit('a');
  assert.equal(calls, 0);
});

test('off with only an event name removes all listeners for that event', () => {
  const e = new Emitter();
  let calls = 0;
  e.on('a', () => calls++);
  e.on('a', () => calls++);
  e.off('a');
  e.emit('a');
  assert.equal(calls, 0);
});

test('off with no arguments clears every event', () => {
  const e = new Emitter();
  let calls = 0;
  e.on('a', () => calls++);
  e.on('b', () => calls++);
  e.off();
  e.emit('a');
  e.emit('b');
  assert.equal(calls, 0);
  assert.equal(e.listenerCount('a'), 0);
  assert.equal(e.listenerCount('b'), 0);
});

test('off removes every occurrence of a duplicate listener', () => {
  const e = new Emitter();
  let calls = 0;
  const fn = () => calls++;
  e.on('a', fn);
  e.on('a', fn);
  e.on('a', fn);
  e.off('a', fn);
  e.emit('a');
  assert.equal(calls, 0);
});

test('off for an unknown event is a silent no-op', () => {
  const e = new Emitter();
  assert.doesNotThrow(() => e.off('never', () => {}));
});

test('off matches a once listener by the original function reference', () => {
  // The README documents that to cancel a pending once you must keep the
  // original listener handle. This test pins that contract.
  const e = new Emitter();
  let calls = 0;
  const fn = () => calls++;
  e.once('e', fn);
  e.off('e', fn);
  e.emit('e');
  assert.equal(calls, 0);
});

// ---- snapshot dispatch semantics ----

test('listener that removes a later listener does not prevent it firing this emit', () => {
  // Snapshot is taken at emit start: removal during dispatch only affects
  // subsequent emits.
  const e = new Emitter();
  const log = [];
  const second = () => log.push('second');
  e.on('e', () => {
    log.push('first');
    e.off('e', second);
  });
  e.on('e', second);
  e.emit('e');
  assert.deepEqual(log, ['first', 'second']);
  e.emit('e');
  assert.deepEqual(log, ['first', 'second', 'first']);
});

test('listener added during dispatch is not called in the same emit', () => {
  const e = new Emitter();
  const log = [];
  e.on('e', () => {
    log.push('first');
    e.on('e', () => log.push('late'));
  });
  e.emit('e');
  assert.deepEqual(log, ['first']);
});

// ---- metadata / introspection ----

test('listenerCount reports current counts including pending once wrappers', () => {
  const e = new Emitter();
  e.on('a', () => {});
  e.on('a', () => {});
  e.once('a', () => {});
  assert.equal(e.listenerCount('a'), 3);
  e.emit('a');
  assert.equal(e.listenerCount('a'), 2);
});

test('eventNames lists registered events', () => {
  const e = new Emitter();
  e.on('a', () => {});
  e.on('b', () => {});
  const names = e.eventNames().sort();
  assert.deepEqual(names, ['a', 'b']);
});

// ---- argument validation (the implemented contract) ----

test('on throws TypeError for non-function listener', () => {
  const e = new Emitter();
  assert.throws(() => e.on('a', null), TypeError);
});

test('emit throws TypeError for non-string event name', () => {
  const e = new Emitter();
  assert.throws(() => e.emit(123), TypeError);
});

// ---- prototype-pollution hardening (the real reason for null-proto) ----

test('an event named "constructor" does not collide with Object.prototype', () => {
  const e = new Emitter();
  let calls = 0;
  e.on('constructor', () => calls++);
  e.emit('constructor');
  assert.equal(calls, 1);
  assert.equal(e.listenerCount('constructor'), 1);
});
