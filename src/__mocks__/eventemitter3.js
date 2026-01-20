// Mock implementation of eventemitter3 for Jest tests
class MockEventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, listener) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }

  off(event, listener) {
    if (!this._events[event]) return this;

    if (listener) {
      const index = this._events[event].indexOf(listener);
      if (index !== -1) {
        this._events[event].splice(index, 1);
      }
    } else {
      this._events[event] = [];
    }

    return this;
  }

  emit(event, ...args) {
    if (!this._events[event]) return false;

    this._events[event].forEach((listener) => {
      try {
        listener(...args);
      } catch (error) {
        console.error("Error in event listener:", error);
      }
    });

    return true;
  }

  once(event, listener) {
    const onceWrapper = (...args) => {
      this.off(event, onceWrapper);
      listener(...args);
    };

    return this.on(event, onceWrapper);
  }

  removeAllListeners(event) {
    if (event) {
      this._events[event] = [];
    } else {
      this._events = {};
    }
    return this;
  }

  listenerCount(event) {
    return this._events[event] ? this._events[event].length : 0;
  }

  listeners(event) {
    return this._events[event] ? [...this._events[event]] : [];
  }
}

module.exports = MockEventEmitter;
module.exports.default = MockEventEmitter;
