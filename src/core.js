/**
 * Tiny typed event emitter.
 *
 * Design decisions (stated plainly so the tests and the README agree):
 *
 * 1. Listener order is insertion order. On, Once, and Prepend all append to the
 *    same per-event array. There is no "prepend" helper — if you need a listener
 *    to run before previously-registered ones, re-emit or restructure. Keeping a
 *    single list means removal during dispatch is simple and O(n) in listeners,
 *    which is the only sane option for a sub-100-line library.
 *
 * 2. A Once listener is removed BEFORE it is invoked, not after. This means a
 *    listener that throws will still only fire once, and it means the listener
 *    can re-add itself (via On) inside its own body without that re-add being
 *    immediately cancelled by an external "clear all once" sweep.
 *
 * 3. Emit copies the listener array snapshot before dispatching. A listener that
 *    calls Off for an event it did not register against is a no-op, and a
 *    listener that calls Off to remove itself or a later listener will still be
 *    dispatched exactly once for the current emit — the snapshot wins. This is
 *    the Node.js EventEmitter behaviour and it is the least surprising.
 *
 * 4. Emit returns true if any listener was called, false otherwise. It does not
 *    return the number of listeners; that is a separate method. Returning a
 *    boolean keeps the happy-path "did anyone hear me?" check ergonomic without
 *    inviting callers to assert on exact counts, which are brittle in tests.
 *
 * 5. NewListener and RemoveListener meta-events are NOT supported. They add
 *    reentrancy and ordering pitfalls that a "tiny" emitter should not own.
 */

/** @typedef {Record<string, unknown>} EventMap */
/** @typedef {(payload: any) => void} Listener */

export class Emitter {
  constructor() {
    /**
     * Map of event name -> array of listeners.
     *
     * Stored as a plain object with a null prototype so that an event named
     * "constructor" or "toString" cannot collide with inherited properties —
     * a real footgun in the naive `{}` approach.
     */
    this._listeners = Object.create(null);
  }

  /**
   * Register a listener for an event.
   * @param {string} event
   * @param {Listener} listener
   * @returns {this}
   */
  on(event, listener) {
    if (typeof event !== 'string') {
      throw new TypeError('Emitter.on: event name must be a string');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('Emitter.on: listener must be a function');
    }
    const list = this._listeners[event];
    if (list === undefined) {
      this._listeners[event] = [listener];
    } else {
      list.push(listener);
    }
    return this;
  }

  /**
   * Register a one-time listener. It is removed before invocation so that a
   * listener which re-adds itself (via `on`) still fires on the next emit.
   * @param {string} event
   * @param {Listener} listener
   * @returns {this}
   */
  once(event, listener) {
    if (typeof event !== 'string') {
      throw new TypeError('Emitter.once: event name must be a string');
    }
    if (typeof listener !== 'function') {
      throw new TypeError('Emitter.once: listener must be a function');
    }
    /**
     * Wrapper closes over `listener` rather than `this` + event name so that
     * the original function reference is what `off` can match against. The
     * wrapper is linked back to the original via a property so `off` can find
     * it when callers pass the original listener. Callers who want to cancel
     * a pending `once` must keep a handle to the original listener and pass
     * it to `off`.
     */
    const wrapper = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    wrapper._original = listener;
    return this.on(event, wrapper);
  }

  /**
   * Remove a listener. If `listener` is omitted, removes ALL listeners for the
   * event. If `event` is also omitted, removes every listener on the emitter.
   *
   * Removing a never-registered listener is a silent no-op. This is deliberate:
   * throwing would make teardown helpers that call `off` defensively painful.
   *
   * @param {string} [event]
   * @param {Listener} [listener]
   * @returns {this}
   */
  off(event, listener) {
    if (arguments.length === 0) {
      this._listeners = Object.create(null);
      return this;
    }
    if (typeof event !== 'string') {
      throw new TypeError('Emitter.off: event name must be a string');
    }
    const list = this._listeners[event];
    if (list === undefined) {
      return this;
    }
    if (listener === undefined) {
      delete this._listeners[event];
      return this;
    }
    if (typeof listener !== 'function') {
      throw new TypeError('Emitter.off: listener must be a function');
    }
    // Reverse iteration + splice removes duplicates correctly even if the same
    // function was registered multiple times — every occurrence is removed, in
    // one pass, without index drift. `===` identity match, no value coercion.
    // A once listener is matched by the original function the caller passed to
    // `once`, via the wrapper's `_original` link.
    for (let i = list.length - 1; i >= 0; i--) {
      const entry = list[i];
      if (entry === listener || (entry !== null && entry._original === listener)) {
        list.splice(i, 1);
      }
    }
    if (list.length === 0) {
      delete this._listeners[event];
    }
    return this;
  }

  /**
   * Emit an event. Dispatches to a snapshot of the current listener list, so
   * listeners added or removed during dispatch do not affect the current emit
   * (newly added listeners are skipped; removed-but-not-yet-dispatched ones
   * still fire).
   *
   * @param {string} event
   * @param {*} [payload]
   * @returns {boolean} true iff at least one listener was called.
   */
  emit(event, payload) {
    if (typeof event !== 'string') {
      throw new TypeError('Emitter.emit: event name must be a string');
    }
    const list = this._listeners[event];
    if (list === undefined || list.length === 0) {
      return false;
    }
    const snapshot = list.slice();
    for (let i = 0; i < snapshot.length; i++) {
      snapshot[i](payload);
    }
    return true;
  }

  /**
   * Return the number of listeners for an event (including pending `once`
   * wrappers). Returns 0 for an event that was never registered.
   * @param {string} event
   * @returns {number}
   */
  listenerCount(event) {
    if (typeof event !== 'string') {
      throw new TypeError('Emitter.listenerCount: event name must be a string');
    }
    const list = this._listeners[event];
    return list === undefined ? 0 : list.length;
  }

  /**
   * Return the list of registered event names. Order is unspecified.
   * @returns {string[]}
   */
  eventNames() {
    return Object.keys(this._listeners);
  }
}
