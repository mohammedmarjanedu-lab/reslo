export function createAwatifModel() {
  return {
    version: '0.1-stub',
    ready: false,
    async initialize() {
      this.ready = true;
      return true;
    }
  };
}
