const GAME_NAME_NORMALIZATION = new Map([
  ['Age2HD', 'Age of Empires II HD'],
  ['AoE2DE', 'Age of Empires II: Definitive Edition'],
  ['Battlefield 6', 'Battlefield 2042'],
  ['DB Xenoverse 2', 'Dragon Ball Xenoverse 2'],
  ['dota 2 beta', 'Dota 2'],
  ['DRAGON BALL FighterZ', 'Dragon Ball FighterZ'],
  ['DRAGON BALL Sparking! ZERO', 'Dragon Ball: Sparking! ZERO'],
  ['EA SPORTS FC 25 Demo', 'EA SPORTS FC 25'],
  ['FateTriggerDemo', 'FateTrigger'],
  ['ItTakesTwo', 'It Takes Two'],
  ['MegaMan2', 'Mega Man 2'],
  ['MegaMan_BattleNetwork_LegacyCollection_Vol1', 'Mega Man Battle Network Legacy Collection Vol. 1'],
  ['MegaMan_BattleNetwork_LegacyCollection_Vol2', 'Mega Man Battle Network Legacy Collection Vol. 2'],
  ['MEGA_MAN_X_DiVE_Offline', 'Mega Man X DiVE Offline'],
  ['ONE PUNCH MAN A HERO NOBODY KNOWS', 'One Punch Man: A Hero Nobody Knows'],
  ['PVZGW2', 'Plants vs. Zombies: Garden Warfare 2'],
  ['RESIDENT EVIL 2 BIOHAZARD RE2', 'Resident Evil 2'],
  ['RESIDENT EVIL 4 BIOHAZARD RE4', 'Resident Evil 4'],
  ['RESIDENT EVIL 7 biohazard', 'Resident Evil 7'],
  ['RESIDENT EVIL requiem BIOHAZARD requiem', 'Resident Evil Re:Verse'],
  ['SonicColorsUltimate', 'Sonic Colors Ultimate'],
  ['SonicRacingCrossWorlds', 'Sonic Racing Cross Worlds'],
  ['SONIC_X_SHADOW_GENERATIONS', 'Sonic X Shadow Generations'],
  ['PVZGW2', 'Plants vs. Zombies: Garden Warfare 2'],
  ['paladins pts', 'Paladins'],
  ['Slime Rancher Demo', 'Slime Rancher'],
  ['Sand Playtest', 'Sand'],
]);

const GAME_NAME_BLACKLIST = new Set([
  'Steamworks Shared',
  'TaskbarHero',
  'Aim Lab',
]);

function normalizeGameName(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  const normalized = GAME_NAME_NORMALIZATION.get(trimmed);
  if (normalized) return normalized;

  const cleaned = trimmed
    .replace(/\b(Demo|demo|Trial|trial|Playtest|playtest|Beta|beta|PTs|pts)\b/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned.replace(/\s+$/g, '');
}

const GAME_NAMES = [
  'Age of Mythology Retold',
  'Age2HD',
  'Aim Lab',
  'Aimtastic',
  'American Truck Simulator',
  'AoE2DE',
  'Apex Legends',
  'Battlefield 2042',
  'Battlefield 6',
  'Black Squad',
  'BLEACH Rebirth of Souls',
  'Bloodhunt',
  'Call of Duty Advanced Warfare',
  'Call of Duty HQ',
  'CarX Street',
  'Chivalry 2',
  'Combat Master',
  'Counter-Strike Global Offensive',
  'Cyberpunk 2077',
  'DB Xenoverse 2',
  'DCSWorld',
  'Dead by Daylight',
  'Deadlock',
  'Delta Force',
  'Devil May Cry 5',
  'DOOMEternal',
  'dota 2 beta',
  'DRAGON BALL FighterZ',
  'DRAGON BALL Sparking! ZERO',
  'Dungeon Rampage Demo',
  'EA SPORTS FC 25 Demo',
  'eFootball',
  'Expedition 33',
  'FateTriggerDemo',
  'For Honor',
  'Ghost Recon Breakpoint',
  'Grand Theft Auto V',
  'GTFO',
  'GunZ 2 The Second Duel',
  'Halo The Master Chief Collection',
  'Helldivers 2',
  'Hollow Knight',
  'ItTakesTwo',
  'Knight Online',
  'Left 4 Dead 2',
  'LoveBeat',
  'MapleStory',
  'Marvel Heroes',
  'MarvelRivals',
  'MechaBREAK',
  'Mega Man 11',
  'Mega Man X Legacy Collection',
  'Mega Man X Legacy Collection 2',
  'MegaMan2',
  'MegaMan_BattleNetwork_LegacyCollection_Vol1',
  'MegaMan_BattleNetwork_LegacyCollection_Vol2',
  'MEGA_MAN_X_DiVE_Offline',
  'Metro Exodus Enhanced Edition',
  'Mortal Kombat 1',
  'MU Legend',
  'MZZXLC',
  'NARUTO SHIPPUDEN Ultimate Ninja STORM 4',
  'No Man\'s Sky',
  'OffTheGrid',
  'Once Human',
  'ONE PUNCH MAN A HERO NOBODY KNOWS',
  'Overwatch',
  'Paladins',
  'paladins pts',
  'Party Animals',
  'PAYDAY 2',
  'PEAK',
  'Poppy Playtime',
  'PUBG',
  'PVZGW2',
  'Rakion',
  'RESIDENT EVIL 2 BIOHAZARD RE2',
  'RESIDENT EVIL 4 BIOHAZARD RE4',
  'RESIDENT EVIL 7 biohazard',
  'RESIDENT EVIL requiem BIOHAZARD requiem',
  'Rust',
  'Sand Playtest',
  'Skate',
  'Slime Rancher Demo',
  'SMITE',
  'SMITE 2',
  'smite pt',
  'SonicColorsUltimate',
  'SonicRacingCrossWorlds',
  'SONIC_X_SHADOW_GENERATIONS',
  'Steamworks Shared',
  'Strinova',
  'Suzy',
  'Sven Co-op',
  'TaskbarHero',
  'The Black Pool Arena Survivors',
  'The Finals',
  'The Last of Us Part II',
  'The Sims 4',
  'Throne and Liberty',
  'Tom Clancy\'s Rainbow Six Siege',
  'War Thunder',
  'World of Warplanes',
  'World of Warships',
  'World War Legion',
  'Wuthering Waves',
];

const PLATFORM_DEFINITIONS = [
  { key: 'Steam', name: 'Steam', domain: 'store.steampowered.com' },
  { key: 'BattleNet', name: 'BattleNet', domain: 'battle.net' },
  { key: 'EpicGames', name: 'Epic Games', domain: 'store.epicgames.com' },
  { key: 'RioGamer', name: 'Rio Gamer', domain: 'riogamer.com' },
  { key: 'Xbox', name: 'Xbox', domain: 'xbox.com' },
  { key: 'PlayStation', name: 'PlayStation', domain: 'playstation.com' },
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getPlatformsForGame(name) {
  const normalized = String(name || '').toLowerCase();
  const platforms = [];

  const addPlatform = (key) => {
    if (!platforms.includes(key)) platforms.push(key);
  };

  if (/(steam|counter|dota|rust|pubg|payday|smite|left 4 dead|dead by daylight|war thunder|world of warships|world of warplanes|resident evil|sonic|mega man|dragon ball|halo)/i.test(normalized)) {
    addPlatform('Steam');
  }

  if (/(battlefield|call of duty|overwatch|apex|warzone|diablo|world of warcraft)/i.test(normalized)) {
    addPlatform('BattleNet');
  }

  if (/(fortnite|ea sports|fifa|sims|rocket league|dead by daylight|battlefield|apex|ghost recon|the finals)/i.test(normalized)) {
    addPlatform('EpicGames');
  }

  if (/(counter|dota|league|pubg|smite|war thunder|payday|resident evil|sonic|mega man|dragon ball|the finals|halo|apex|rust)/i.test(normalized)) {
    addPlatform('RioGamer');
  }

  if (platforms.length === 0) {
    addPlatform('Steam');
  }

  if (platforms.length < 2) {
    addPlatform('EpicGames');
  }

  return platforms.slice(0, 3).map((key) => PLATFORM_DEFINITIONS.find((platform) => platform.key === key) || PLATFORM_DEFINITIONS[0]);
}

function buildGameCatalog(names = GAME_NAMES) {
  return names
    .filter(Boolean)
    .map((name) => normalizeGameName(name))
    .map((name) => ({ name }))
    .filter((entry) => entry.name && !GAME_NAME_BLACKLIST.has(entry.name))
    .map((entry, index) => ({
      id: index + 1,
      name: entry.name,
      slug: slugify(entry.name),
      platforms: getPlatformsForGame(entry.name),
    }));
}

function filterGames(games, query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return games;
  return games.filter((game) => game.name.toLowerCase().includes(normalizedQuery));
}

async function getGamesCatalog(search = '') {
  try {
    const { query } = require('../db');
    const result = await query(
      'SELECT id, name, slug, platforms FROM games WHERE ($1::text = \"\" OR name ILIKE $1) ORDER BY name ASC',
      [`%${String(search || '').trim()}%`]
    );

    if (Array.isArray(result.rows) && result.rows.length > 0) {
      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        platforms: Array.isArray(row.platforms) ? row.platforms : [],
      }));
    }
  } catch (error) {
    console.warn('Falling back to built-in games catalog:', error.message || error);
  }

  const builtInGames = buildGameCatalog();
  return filterGames(builtInGames, search);
}

async function seedGamesCatalog(queryFn) {
  const catalog = buildGameCatalog();
  for (const game of catalog) {
    await queryFn(
      'INSERT INTO games (name, slug, platforms) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
      [game.name, game.slug, JSON.stringify(game.platforms)]
    );
  }
  return catalog;
}

module.exports = {
  GAME_NAMES,
  PLATFORM_DEFINITIONS,
  buildGameCatalog,
  filterGames,
  getGamesCatalog,
  seedGamesCatalog,
};
