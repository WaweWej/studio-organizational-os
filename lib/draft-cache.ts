// Per-tab recovery prevents another open tab from overwriting unfinished work.
// The authenticated workspace+member key is supplied by the server.
export class DraftCache<T extends { text: string }> extends Map<string, T> {
  private scope = '';
  private storage: Storage | null = null;
  available = false;
  lastKey = 'workspace';
  configure(scope: string, storage: Storage | null) {
    if (this.scope === scope) return;
    super.clear();
    this.scope = scope;
    this.storage = storage;
    this.available = !!storage;
    try {
      const raw = storage?.getItem('studio:drafts:v1:' + scope);
      if (raw && raw.length < 2000000) {
        const saved = JSON.parse(raw);
        if (
          saved.version === 1 &&
          Date.now() - saved.savedAt < 7 * 86400000 &&
          Array.isArray(saved.entries)
        ) {
          for (const [key, value] of saved.entries)
            if (
              typeof key === 'string' &&
              value &&
              typeof value.text === 'string' &&
              Array.isArray(value.pins)
            )
              super.set(key, value);
          if (typeof saved.lastKey === 'string') this.lastKey = saved.lastKey;
        }
      }
    } catch {
      this.available = false;
    }
  }
  private persist() {
    if (!this.scope || !this.storage) return;
    try {
      this.storage.setItem(
        'studio:drafts:v1:' + this.scope,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          lastKey: this.lastKey,
          entries: [...this],
        }),
      );
      this.available = true;
    } catch {
      this.available = false;
    }
  }
  override set(key: string, value: T) {
    super.set(key, value);
    if (value.text.trim()) this.lastKey = key;
    this.persist();
    return this;
  }
  override delete(key: string) {
    const deleted = super.delete(key);
    this.persist();
    return deleted;
  }
  override clear() {
    super.clear();
    this.persist();
  }
}
