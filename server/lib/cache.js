export class TtlCache {
  #entries = new Map();
  #ttlMs;

  constructor(ttlMs) {
    this.#ttlMs = ttlMs;
  }

  get(key) {
    const entry = this.#entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.createdAt > this.#ttlMs) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key, value) {
    this.#entries.set(key, { value, createdAt: Date.now() });

    if (this.#entries.size > 200) {
      const oldest = this.#entries.keys().next().value;
      this.#entries.delete(oldest);
    }

    return value;
  }

  clear() {
    this.#entries.clear();
  }
}
