'use strict';

const AREAS = [
  'Espiritualidade',
  'Identidade',
  'Energia & Ritmo',
  'Trabalho & Provisão',
  'Relacionamento'
];

const AREA_FALLBACK = 'Energia & Ritmo';

function normalizeArea(area) {
  const value = String(area || '').trim().toLowerCase();
  const found = AREAS.find((item) => item.toLowerCase() === value);
  return found || AREA_FALLBACK;
}

module.exports = { AREAS, AREA_FALLBACK, normalizeArea };
