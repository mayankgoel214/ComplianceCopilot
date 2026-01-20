// Mock implementation of p-queue for Jest tests
class MockPQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 1;
    this.interval = options.interval || 0;
    this.intervalCap = options.intervalCap || Infinity;
    this.carryoverConcurrencyCount = options.carryoverConcurrencyCount || false;
    this.autoStart = options.autoStart !== false;
    this.queueClass = options.queueClass || Array;
    this.pending = 0;
    this.size = 0;
    this.isPaused = false;
    this._queue = [];
    this._queueClass = this.queueClass;
  }

  async add(fn, options = {}) {
    return new Promise((resolve, reject) => {
      const task = {
        fn,
        options,
        resolve,
        reject,
        id: Math.random().toString(36).substr(2, 9),
      };

      this._queue.push(task);
      this.size = this._queue.length;

      if (this.autoStart && !this.isPaused) {
        this._process();
      }
    });
  }

  async _process() {
    if (
      this.isPaused ||
      this.pending >= this.concurrency ||
      this._queue.length === 0
    ) {
      return;
    }

    const task = this._queue.shift();
    this.size = this._queue.length;
    this.pending++;

    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.pending--;
      if (this._queue.length > 0) {
        setImmediate(() => this._process());
      }
    }
  }

  pause() {
    this.isPaused = true;
  }

  start() {
    this.isPaused = false;
    this._process();
  }

  clear() {
    this._queue.forEach((task) => {
      task.reject(new Error("Task cleared"));
    });
    this._queue = [];
    this.size = 0;
  }

  onEmpty() {
    return new Promise((resolve) => {
      if (this.size === 0 && this.pending === 0) {
        resolve();
      } else {
        const checkEmpty = () => {
          if (this.size === 0 && this.pending === 0) {
            resolve();
          } else {
            setTimeout(checkEmpty, 10);
          }
        };
        checkEmpty();
      }
    });
  }

  onIdle() {
    return this.onEmpty();
  }
}

module.exports = MockPQueue;
module.exports.default = MockPQueue;
