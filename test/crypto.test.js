const test = require('node:test');
const assert = require('node:assert/strict');

const { encryptSecret, decryptSecret, last4 } = require('../src/integrations/crypto');

test('crypto: cifra e decifra um segredo (roundtrip)', () => {
  const plaintext = 'sk-test-1234567890-abcdef';
  const enc = encryptSecret(plaintext);

  assert.ok(enc.ciphertext && enc.iv && enc.tag);
  assert.notEqual(enc.ciphertext, plaintext);
  assert.equal(decryptSecret(enc), plaintext);
});

test('crypto: gera ciphertexts distintos (IV aleatório)', () => {
  const a = encryptSecret('mesma-chave');
  const b = encryptSecret('mesma-chave');
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(decryptSecret(a), decryptSecret(b));
});

test('crypto: detecta adulteração (autenticação GCM)', () => {
  const enc = encryptSecret('chave-secreta');
  const tampered = { ...enc, ciphertext: Buffer.from('outro-valor').toString('base64') };
  assert.throws(() => decryptSecret(tampered));
});

test('crypto: last4 nunca expõe a chave inteira', () => {
  assert.equal(last4('sk-abcdef1234567890'), '7890');
  assert.equal(last4('ab'), 'ab');
});
