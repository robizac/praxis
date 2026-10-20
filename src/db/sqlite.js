'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

/**
 * Indica que este processo é um worker do `node --test`.
 *
 * O test runner define `NODE_TEST_CONTEXT` em cada processo de teste. É mais
 * confiável que `NODE_ENV`: nem todo arquivo de teste define `NODE_ENV`, e
 * alguns o definem depois de já terem importado o banco.
 */
function isTestProcess() {
  return Boolean(process.env.NODE_TEST_CONTEXT) || process.env.NODE_ENV === 'test';
}

/**
 * Resolve o arquivo SQLite deste processo.
 *
 * Produção/dev: arquivo único em `praxis.db` na raiz do projeto (mesmo caminho
 * do legado, ignorado no git).
 *
 * Testes: o `node --test` roda cada arquivo de teste em seu PRÓPRIO processo,
 * em paralelo. Se todos abrissem o mesmo `praxis.db`, as migrações correriam em
 * corrida (o "check-then-act" de `runMigrations`) e os processos perdedores
 * falhariam com `duplicate column name`. Por isso cada processo de teste usa um
 * arquivo isolado e descartável.
 *
 * Pode ser sobrescrito por `PRAXIS_DB_FILE` (útil para inspecionar um arquivo
 * específico ou reaproveitar um banco).
 */
function resolveDbPath() {
  if (process.env.PRAXIS_DB_FILE) {
    return process.env.PRAXIS_DB_FILE;
  }
  if (isTestProcess()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-test-db-'));
    return path.join(dir, 'praxis.db');
  }
  // Mantém o arquivo no root do projeto (mesmo caminho do legado), ignorado no git.
  return path.join(__dirname, '..', '..', 'praxis.db');
}

const dbPath = resolveDbPath();
const isTemporaryDb = isTestProcess();
const db = new sqlite3.Database(dbPath);

// Em testes, remove o arquivo temporário (e o WAL) ao encerrar o processo.
if (isTemporaryDb) {
  process.on('exit', () => {
    try {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
      fs.rmdirSync(path.dirname(dbPath));
    } catch (_error) {
      // limpeza best-effort; o SO cuida do diretório temporário depois
    }
  });
}

// Habilita integridade referencial (necessário para ON DELETE CASCADE).
db.run('PRAGMA foreign_keys = ON');

// Concorrência: espera em vez de falhar quando outro processo está escrevendo
// (ex.: múltiplos arquivos de teste em paralelo). WAL melhora leitura concorrente.
db.run('PRAGMA busy_timeout = 5000');
db.run('PRAGMA journal_mode = WAL');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ changes: this.changes, lastId: this.lastID });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function query(sql, params = []) {
  const rows = await all(sql, params);
  return { rows, rowCount: rows.length };
}

async function insertReturningId(sql, params = []) {
  const result = await run(sql, params);
  return result.lastId;
}

function close() {
  return new Promise((resolve) => db.close(() => resolve()));
}

module.exports = {
  dialect: 'sqlite',
  db,
  dbPath,
  run,
  get,
  all,
  exec,
  query,
  insertReturningId,
  close
};
