const fs = require('fs');
const path = require('path');
const db = require('../db');

async function runMigration() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'init.sql'), 'utf8');
  await db.query(sql);
  console.log('Database initialized successfully.');
  process.exit(0);
}

runMigration().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
