'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Mantém o arquivo no root do projeto (mesmo caminho do legado), ignorado no git.
const dbPath = path.join(__dirname, '..', '..', 'praxis.db');
const db = new sqlite3.Database(dbPath);

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
  run,
  get,
  all,
  exec,
  query,
  insertReturningId,
  close
};
