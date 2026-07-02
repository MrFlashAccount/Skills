import { watch } from 'node:fs';
import { DASHBOARD_EVENT_TYPES } from '../contracts/dashboard-contracts.mjs';

function safeJson(value) {
  return JSON.stringify(value);
}

export class DashboardEventPublisher {
  constructor({ snapshot, pollMs = 1000, watchPath, errorMessage = (error) => error?.message ?? String(error) } = {}) {
    if (typeof snapshot !== 'function') throw new Error('dashboard snapshot function is required');
    this.snapshot = snapshot;
    this.pollMs = pollMs;
    this.watchPath = watchPath;
    this.errorMessage = errorMessage;
    this.subscribers = new Set();
    this.timer = undefined;
    this.watcher = undefined;
    this.lastPayload = undefined;
    this.lastData = undefined;
    this.refreshing = false;
    this.closed = false;
  }

  subscribe(callback) {
    if (typeof callback !== 'function') throw new Error('dashboard subscriber callback is required');
    this.subscribers.add(callback);
    if (this.lastPayload !== undefined) callback({ type: DASHBOARD_EVENT_TYPES.SNAPSHOT, data: this.lastData });
    return () => this.subscribers.delete(callback);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refresh().catch((error) => this.publishError(error));
    }, this.pollMs);
    this.timer.unref?.();
    if (this.watchPath) {
      try {
        this.watcher = watch(this.watchPath, { persistent: false }, () => {
          this.refresh().catch((error) => this.publishError(error));
        });
      } catch {
        this.watcher = undefined;
      }
    }
    this.refresh().catch((error) => this.publishError(error));
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.watcher?.close();
    this.watcher = undefined;
    this.subscribers.clear();
  }

  async refresh() {
    if (this.refreshing || this.closed) return;
    this.refreshing = true;
    try {
      const data = await this.snapshot();
      const payload = safeJson(data);
      if (payload !== this.lastPayload) {
        this.lastPayload = payload;
        this.lastData = data;
        this.publish({ type: DASHBOARD_EVENT_TYPES.SNAPSHOT, data });
      }
    } finally {
      this.refreshing = false;
    }
  }

  publish(event) {
    for (const subscriber of this.subscribers) {
      try { subscriber(event); } catch {}
    }
  }

  publishError(error) {
    this.publish({
      type: DASHBOARD_EVENT_TYPES.ERROR,
      data: { message: this.errorMessage(error) },
    });
  }
}
