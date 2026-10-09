/**
 * Lagring av fremdrift. Alle kall er pakket i try/catch slik at appen virker
 * også uten localStorage (privat modus, blokkert lagring, iframe uten tilgang).
 *
 * createStorage(backend) lar tester sende inn et eget "backend"-objekt med
 * getItem/setItem/removeItem.
 */

const PREFIX = 'intensivlab:';

function defaultBackend() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* tilgang nektet */
  }
  return null;
}

export function createStorage(backend = defaultBackend(), prefix = PREFIX) {
  const key = (k) => prefix + k;

  return {
    /** Hent lagret verdi (JSON) eller fallback. */
    get(k, fallback = null) {
      try {
        if (!backend) return fallback;
        const raw = backend.getItem(key(k));
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    /** Lagre verdi (JSON). Returnerer true ved suksess. */
    set(k, value) {
      try {
        if (!backend) return false;
        backend.setItem(key(k), JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    /** Fjern nøkkel. Returnerer true ved suksess. */
    remove(k) {
      try {
        if (!backend) return false;
        backend.removeItem(key(k));
        return true;
      } catch {
        return false;
      }
    },

    /** Oppdater verdi via funksjon: update('k', v => ({...v, x: 1}), fallback). */
    update(k, fn, fallback = null) {
      const next = fn(this.get(k, fallback));
      this.set(k, next);
      return next;
    },

    /** Er lagring tilgjengelig? */
    get available() {
      try {
        if (!backend) return false;
        const probe = key('__probe__');
        backend.setItem(probe, '1');
        backend.removeItem(probe);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const storage = createStorage();
