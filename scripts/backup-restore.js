'use strict';

/**
 * Teste de restauração de backup (Fase 8).
 *
 * Uso:
 *   npm run backup:test-restore -- --file backups/praxis-20261020T030000Z.db
 *   npm run backup:test-restore -- --file /var/backups/praxis.dump \
 *     --target postgres://user:pass@host:5432/praxis_restore_test
 *
 * SQLite: copia o arquivo para um diretório temporário, abre, roda
 * `PRAGMA integrity_check` e confere as tabelas/migrações.
 *
 * Postgres: restaura o dump em um banco DESCARTÁVEL (`--target`) com
 * `pg_restore` e confere as tabelas/migrações. O script se recusa a usar a
 * mesma URL de `DATABASE_URL`, para não sobrescrever o banco real.
 *
 * O banco temporário do SQLite é removido no final. O banco de destino do
 * Postgres NÃO é removido (você o cria e descarta no processo de teste).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const { Client } = require('pg');
const { config } = require('../src/config/env');

const CORE_TABLES = [
  'schema_migrations',
  'users',
  'sessions',
  'audit_log',
  'praxis_items',
  'reminders',
  'weekly_reviews',
  'ai_usage',
  'ai_credentials',
  'subscriptions',
  'stripe_events'
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

const file = argValue('--file');
const target = argValue('--target');
const keep = process.argv.includes('--keep');

function openSqlite(dbFile) {
  return new Promise((resolve, reject) => {
    // Abre em modo leitura/escrita no arquivo TEMPORÁRIO: se o backup veio de
    // um banco com WAL, o SQLite consegue aplicar/recover no diretório copiado.
    const handle = new sqlite3.Database(dbFile, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(handle);
      }
    });
  });
}

function sqliteAll(handle, sql, params = []) {
  return new Promise((resolve, reject) => {
    handle.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
      } else {
        resolve(rows);
      }
    });
  });
}

function sqliteGet(handle, sql) {
  return new Promise((resolve, reject) => {
    handle.get(sql, (error, row) => {
      if (error) {
        reject(error);
      } else {
        resolve(row);
      }
    });
  });
}

function closeSqlite(handle) {
  return new Promise((resolve) => handle.close(() => resolve()));
}

function missingTables(found) {
  return CORE_TABLES.filter((table) => !found.includes(table));
}

async function restoreSqlite(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-restore-'));
  const copy = path.join(dir, 'restored.db');
  fs.copyFileSync(source, copy);
  for (const suffix of ['-wal', '-shm', '-journal']) {
    if (fs.existsSync(`${source}${suffix}`)) {
      fs.copyFileSync(`${source}${suffix}`, `${copy}${suffix}`);
    }
  }

  const handle = await openSqlite(copy);
  try {
    const integrity = await sqliteGet(handle, 'PRAGMA integrity_check');
    const tables = await sqliteAll(
      handle,
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const names = tables.map((row) => row.name);

    const missing = missingTables(names);
    if (missing.length) {
      throw new Error(`Tabelas ausentes no backup: ${missing.join(', ')}`);
    }

    const migrations = await sqliteGet(handle, 'SELECT COUNT(*) AS total FROM schema_migrations');
    const users = await sqliteGet(handle, 'SELECT COUNT(*) AS total FROM users');
    const integrityValue = integrity ? Object.values(integrity)[0] : null;

    if (integrityValue !== 'ok') {
      throw new Error(`PRAGMA integrity_check retornou "${integrityValue}".`);
    }

    return {
      dialect: 'sqlite',
      migrations: Number(migrations.total),
      users: Number(users.total),
      tables: names.length,
      integrity: integrityValue
    };
  } finally {
    await closeSqlite(handle);
    if (!keep) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (error) => {
      reject(
        new Error(
          error.code === 'ENOENT'
            ? `${command} não encontrado no PATH. Instale o cliente do Postgres.`
            : `Falha ao executar ${command}: ${error.message}`
        )
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} terminou com código ${code}.`));
      }
    });
  });
}

async function restorePostgres(source) {
  if (!target) {
    throw new Error(
      'Informe --target com a URL de um banco DESCARTÁVEL para restaurar o dump do Postgres.'
    );
  }
  if (target === config.databaseUrl) {
    throw new Error(
      'Recusando restaurar sobre o banco configurado em DATABASE_URL. Use um banco descartável.'
    );
  }

  await run('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    target,
    source
  ]);

  const client = new Client({ connectionString: target });
  await client.connect();
  try {
    const tablesResult = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = tablesResult.rows.map((row) => row.table_name);
    const missing = missingTables(names);
    if (missing.length) {
      throw new Error(`Tabelas ausentes após a restauração: ${missing.join(', ')}`);
    }

    const migrations = await client.query('SELECT COUNT(*)::int AS total FROM schema_migrations');
    const users = await client.query('SELECT COUNT(*)::int AS total FROM users');

    return {
      dialect: 'postgres',
      migrations: migrations.rows[0].total,
      users: users.rows[0].total,
      tables: names.length
    };
  } finally {
    await client.end();
  }
}

async function main() {
  if (!file) {
    throw new Error('Informe --file <caminho do backup>.');
  }
  const source = path.resolve(file);
  if (!fs.existsSync(source)) {
    throw new Error(`Backup não encontrado: ${source}`);
  }

  const result =
    path.extname(source) === '.db' ? await restoreSqlite(source) : await restorePostgres(source);

  console.log(JSON.stringify({ ok: true, file: source, target: target || null, ...result }));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, file: file || null, error: error.message }));
    process.exit(1);
  });
