const test = require('node:test');
const assert = require('node:assert/strict');

const { parsePraxisJson } = require('../src/services/ai/parse');

test('parsePraxisJson normaliza payload do Ollama para o contrato PRAXIS', () => {
  const raw = `texto extra\n{"area":"Area Invalida","acao":"Separar 10 min para revisar tarefas","prazo":"21/02/2026, 20:00","regra_minima":"Se travar, faça 3 min agora"}\ntexto extra`;

  const parsed = parsePraxisJson(raw);

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    Object.keys(parsed.data).sort(),
    ['acao', 'area', 'prazo', 'regra_minima'].sort()
  );
  assert.equal(parsed.data.area, 'Energia & Ritmo');
  assert.equal(typeof parsed.data.acao, 'string');
  assert.equal(typeof parsed.data.prazo, 'string');
  assert.equal(typeof parsed.data.regra_minima, 'string');
});

test('parsePraxisJson rejeita texto sem JSON válido', () => {
  const parsed = parsePraxisJson('sem json nenhum');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'invalid_json');
});
