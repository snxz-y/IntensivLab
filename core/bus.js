/**
 * Enkel hendelsesbuss for løs kobling mellom moduler
 * (f.eks. senere: respirator → blodgass ved gassutveksling).
 */
export function createBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      handlers.get(event)?.delete(fn);
    },
    emit(event, payload) {
      handlers.get(event)?.forEach((fn) => {
        try {
          fn(payload);
        } catch (err) {
          console.error(`Feil i lytter for "${event}":`, err);
        }
      });
    },
  };
}
