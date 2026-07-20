const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { buildGameCatalog, GAME_NAME_BLACKLIST } = require('../services/games');
const { query, pool } = require('../db');

async function run() {
  try {
    await query('BEGIN');

    const catalog = buildGameCatalog();
    console.log('Catalog size:', catalog.length);

    for (const game of catalog) {
      const name = game.name;
      const slug = game.slug;
      const platforms = JSON.stringify(game.platforms || []);

      const found = await query('SELECT id, name, slug FROM games WHERE slug = $1 OR name = $2 LIMIT 1', [slug, name]);

      if (found.rows.length > 0) {
        const row = found.rows[0];
        if (row.name !== name || row.slug !== slug) {
          const conflict = await query('SELECT id FROM games WHERE name = $1 AND id <> $2', [name, row.id]);
          if (conflict.rows.length > 0) {
            console.warn('Name conflict, skipping update for id', row.id, 'target name', name);
          } else {
            await query('UPDATE games SET name=$1, slug=$2, platforms=$3, updated_at=now() WHERE id=$4', [name, slug, platforms, row.id]);
            console.log('Updated', row.id, '->', name);
          }
        } else {
          await query('UPDATE games SET platforms=$1, updated_at=now() WHERE id=$2', [platforms, row.id]);
        }
      } else {
        await query('INSERT INTO games (name, slug, platforms) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [name, slug, platforms]);
        console.log('Inserted', name);
      }
    }

    const blacklist = Array.from(GAME_NAME_BLACKLIST || []);
    if (blacklist.length) {
      const del = await query('DELETE FROM games WHERE name = ANY($1) RETURNING id, name', [blacklist]);
      console.log('Deleted blacklisted rows:', del.rows.length);
    }

    await query('COMMIT');
    console.log('Games table update complete.');
  } catch (err) {
    console.error('Error updating games table:', err);
    try { await query('ROLLBACK'); } catch (e) { /* ignore */ }
    process.exit(1);
  } finally {
    try { await pool.end(); } catch (e) {}
    process.exit(0);
  }
}

run();
