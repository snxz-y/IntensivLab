/**
 * Voksencaser med hovedvekt på respiratorjustering (A1–A50), gruppert etter tema.
 * Hver fil eksporterer en liste; gruppen settes her så listen i UI-et kan dele dem opp.
 */
import { ARDS_CASES } from './ards.js';
import { OBSTRUKTIV_CASES } from './obstruktiv.js';
import { VENTILASJON_CASES } from './ventilasjon.js';
import { ASYNKRONI_CASES } from './asynkroni.js';
import { SPESIELLE_CASES } from './spesielle.js';

const tag = (list, group) => list.map((d) => ({ ...d, group, adultVent: true }));

export const ADULT_VENT_SITUATIONS = [
  ...tag(ARDS_CASES, 'Voksne: oksygenering, ARDS og mageleie'),
  ...tag(OBSTRUKTIV_CASES, 'Voksne: obstruktiv lungesykdom'),
  ...tag(VENTILASJON_CASES, 'Voksne: ventilasjon, CO2 og syre–base'),
  ...tag(ASYNKRONI_CASES, 'Voksne: asynkroni, spontan pust og avvenning'),
  ...tag(SPESIELLE_CASES, 'Voksne: spesielle pasientgrupper'),
];
