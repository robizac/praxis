'use strict';

/**
 * Backup do banco (Fase 8).
 *
 * Uso:
 *   npm run backup
 *   npm run backup -- --out /var/backups/praxis --retention 7
 *
 * - Com `DATABASE_URL`: usa `pg_dump` (formato custom, restaurável com
 *   `pg_restore`). O binário precisa estar instalado no host/container.
 * - Sem `DATABASE_URL`: faz um snapshot consistente do SQLite de dev via
 *   `VACUUM INTO` (inclui o WAL, sem precisar parar o processo).
 *
 * A rotação mantém os `--retention` arquivos mais recentes criados por este
 * script. O agendamento (cron do host/Kymus) fica fora do processo web.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { config } = require('../src/config/env');
const db = require('../src/db');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const outDir = path.resolve(
  argValue('--out') || process.env.BACKUP_DIR || path.join(process.cwd(), 'backups')
);
const retention = positiveInt(argValue('--retention') || process.env.BACKUP_RETENTION, 7);
const prefix = 'praxis-';
const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
const extension = db.dialect === 'postgres' ? 'dump' : 'db';
const targetFile = path.join(outDir, `${prefix}${timestamp}.${extension}`);

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function backupSqlite() {
  if (!fs.existsSync(db.dbPath)) {
    throw new Error(`Banco SQLite não encontrado em ${db.dbPath}.`);
  }
  // VACUUM INTO gera um arquivo autocontido e consistente, já com o WAL aplicado.
  await db.exec(`VACUUM INTO ${sqlString(targetFile)}`);
}

function backupPostgres() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pg_dump',
      ['--format=custom', '--no-owner', '--file', targetFile, config.databaseUrl],
      { stdio: ['ignore', 'inherit', 'inherit'] }
    );

    child.on('error', (error) => {
      reject(
        new Error(
          error.code === 'ENOENT'
            ? 'pg_dump não encontrado no PATH. Instale o cliente do Postgres ou use um host que o ofereça.'
            : `Falha ao executar pg_dump: ${error.message}`
        )
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pg_dump terminou com código ${code}.`));
      }
    });
  });
}

function rotate() {
  if (!fs.existsSync(outDir)) {
    return [];
  }
  const files = fs
    .readdirSync(outDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(`.${extension}`))
    .sort(); // timestamp no nome: ordem lexicográfica = cronológica

  const excess = files.length - retention;
  if (excess <= 0) {
    return [];
  }

  const removed = files.slice(0, excess);
  for (const name of removed) {
    fs.rmSync(path.join(outDir, name), { force: true });
  }
  return removed;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  if (db.dialect === 'postgres') {
    await backupPostgres();
  } else {
    await backupSqlite();
  }

  const sizeBytes = fs.statSync(targetFile).size;
  const removed = rotate();

  console.log(
    JSON.stringify({
      ok: true,
      dialect: db.dialect,
      file: targetFile,
      sizeBytes,
      retention,
      removed
    })
  );
}

main()
  .then(async () => {
    await db.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    try {
      await db.close();
    } catch (_closeError) {
      // ignora: o processo vai sair de qualquer forma
    }
    process.exit(1);
  });
