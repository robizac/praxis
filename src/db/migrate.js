'use strict';

const fs = require('fs/promises');
const path = require('path');

/**
 * Runner de migrações por dialeto.
 * Aplica, em ordem, os arquivos `.sql` de `src/db/migrations/<dialect>/`
 * que ainda não foram registrados em `schema_migrations`.
 */

async function ensureMigrationsTable(adapter) {
  if (adapter.dialect === 'postgres') {
    await adapter.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    return;
  }

  await adapter.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function runMigrations(adapter) {
  await ensureMigrationsTable(adapter);

  const dir = path.join(__dirname, 'migrations', adapter.dialect);
  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const appliedRows = await adapter.all('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.version));
  const executed = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      continue;
    }

    const sql = await fs.readFile(path.join(dir, file), 'utf-8');
    await adapter.exec(sql);
    await adapter.run('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    executed.push(version);
  }

  return executed;
}

module.exports = { runMigrations };
