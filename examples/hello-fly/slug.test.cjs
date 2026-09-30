const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slugify } = require('./slug.cjs');
test('creates a lowercase ASCII slug', () => {
  assert.equal(slugify('Bonjour la mouche !'), 'bonjour-la-mouche');
  assert.equal(slugify('  Café & code  '), 'cafe-code');
  assert.equal(slugify('déjà---vu'), 'deja-vu');
  assert.equal(slugify(''), '');
});
