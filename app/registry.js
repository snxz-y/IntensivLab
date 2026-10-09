/**
 * Modulregister. Ny modul = ny mappe under modules/ + én linje her.
 *
 * Modulkontrakt (modules/<id>/index.js):
 *   export default {
 *     id: 'min-modul',            // brukes i URL: #/min-modul
 *     name: 'Vist navn',
 *     description: 'Én setning om modulen',
 *     mount(container, ctx) {     // ctx: { storage, bus, units }
 *       ...tegn UI i container...
 *       return () => { ...rydd opp (stopp timere, fjern lyttere)... };
 *     },
 *   };
 */
import respirator from '../modules/respirator/index.js';
import blodgass from '../modules/blodgass/index.js';

export const modules = [
  respirator,
  blodgass,
];
