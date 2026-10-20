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
 * Resolve o arquivo SQLite deste processo e se ele é descartável.
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
 * `PRAXIS_DB_FILE` tem precedência e NUNCA é tratado como temporário: quem o
 * define é dono do arquivo e espera que ele persista.
 */
function resolveDb() {
  const override = process.env.PRAXIS_DB_FILE;
  if (override) {
    return { path: override, temporary: false };
  }

  if (isTestProcess()) {
    try {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-test-db-'));
      return { path: path.join(dir, 'praxis.db'), temporary: true, dir };
    } catch (_error) {
      // Sem diretório temporário gravável: cai para um arquivo único por
      // processo ao lado do banco de dev (evita corrida sem depender do tmp).
      const fallback = path.join(__dirname, '..', '..', `.test-praxis-${process.pid}.db`);
      return { path: fallback, temporary: true, dir: null };
    }
  }

  // Mantém o arquivo no root do projeto (mesmo caminho do legado), ignorado no git.
  return { path: path.join(__dirname, '..', '..', 'praxis.db'), temporary: false };
}

const resolved = resolveDb();
const dbPath = resolved.path;
const db = new sqlite3.Database(dbPath);

/**
 * Remove os arquivos do banco temporário deste processo. Best-effort: nunca
 * deve lançar.
 *
 * Importante: NÃO fechamos a conexão aqui. Este handler roda em 'exit' (e em
 * sinais), quando o ambiente do Node já está sendo destruído; chamar
 * `db.close()` nesse momento provoca crash nativo no binding do sqlite3.
 * Em POSIX, apagar o arquivo com a conexão aberta é seguro.
 */
function cleanupTemporaryDb() {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    } catch (_error) {
      // arquivo ainda em uso ou inexistente
    }
  }
  if (resolved.dir) {
    try {
      fs.rmSync(resolved.dir, { recursive: true, force: true });
    } catch (_error) {
      // diretório pode conter arquivos de outro processo
    }
  }
}

// Em testes, limpa o arquivo temporário no encerramento normal E em sinais
// (Ctrl+C, runner matando o worker), que não disparam 'exit'.
if (resolved.temporary) {
  process.once('exit', cleanupTemporaryDb);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      cleanupTemporaryDb();
      process.exit(0);
    });
  }
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
