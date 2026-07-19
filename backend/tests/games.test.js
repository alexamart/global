const assert = require('assert');
const { buildGameCatalog } = require('../services/games');

const names = [
  'Age of Mythology Retold',
  'Apex Legends',
  'Counter-Strike Global Offensive',
  'dota 2 beta',
  'The Finals',
];

const catalog = buildGameCatalog(names);
assert.strictEqual(catalog.length, 5);
assert.strictEqual(catalog[0].name, 'Age of Mythology Retold');
assert.strictEqual(catalog[0].slug, 'age-of-mythology-retold');
assert.strictEqual(catalog[2].platforms[0], 'Steam');
console.log('games test passed');
