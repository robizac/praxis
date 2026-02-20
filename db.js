const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'praxis.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
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

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS praxis_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      texto TEXT NOT NULL,
      acao_pratica TEXT NOT NULL,
      prazo_iso TEXT NOT NULL,
      prazo_humano TEXT NOT NULL,
      regra_minima TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const columns = await all(`PRAGMA table_info('praxis_items')`);
  const hasTags = columns.some((column) => column.name === 'tags');
  if (!hasTags) {
    await run(`ALTER TABLE praxis_items ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      praxis_id INTEGER NOT NULL,
      remind_at_iso TEXT NOT NULL,
      channel TEXT NOT NULL,
      sent_at TEXT,
      FOREIGN KEY (praxis_id) REFERENCES praxis_items(id)
    )
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
