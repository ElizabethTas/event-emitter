# Event Emitter

A tiny ESM event emitter with `on`, `once`, `off`, and `emit`. Zero dependencies, plain JavaScript, designed for small libraries that need typed pub/sub without pulling in Node's `events` module or a framework.

## Usage

```js
import { Emitter } from './src/index.js';

const bus = new Emitter();

const onPing = (payload) => console.log('ping', payload);
bus.on('ping', onPing);
bus.once('ping', (payload) => console.log('one-shot', payload));

bus.emit('ping', { id: 1 }); // logs both listeners
bus.emit('ping', { id: 2 }); // logs only the persistent listener

bus.off('ping', onPing);     // remove a single listener
bus.off('ping');             // remove all listeners for an event
bus.off();                   // remove every listener on the emitter
```

`emit` returns `true` if any listener was called, `false` otherwise.

## Why

The specific problem: most projects either reach for Node's built-in `events` module (which pulls in a fair amount of machinery and is awkward to use in the browser without a bundler) or a dependency that is larger than the code using it. This library is the ~70 lines that cover the cases small projects actually hit: ordered dispatch, one-shot listeners, removal by identity, and bulk teardown. It does not implement `prependListener`, `newListener`/`removeListener` meta-events, async iterators, or `MaxListeners` warnings — if you need those, use the built-in `events` module.

## Edge cases you will hit

- **Removing a `once` listener.** `once` wraps your function internally. To cancel a pending `once`, keep the original function reference and pass it to `off(event, fn)`; the wrapper is matched and removed. Passing the wrapper itself (which you do not have access to) is not how the API works.
- **Listeners that modify the listener list during dispatch.** `emit` snapshots the listener array at the start of the call. A listener added mid-emit will not fire in the current emit; a listener removed mid-emit (even itself) will still fire in the current emit. This matches Node's `EventEmitter` and is the least surprising rule.
- **`off(event, fn)` removes every occurrence of `fn`** if the same function was registered more than once.
- **`off()` with no arguments clears everything.** `off(event)` clears one event. `off(event, fn)` removes one listener. All of these are silent no-ops if there is nothing to remove.
