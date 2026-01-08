const EventEmitter = require('events');

class Notify extends EventEmitter {}

// Singleton emitter for cross-module notifications (balance updates, etc.)
const notify = new Notify();

module.exports = notify;
