'use strict';

const { Pool } = require('pg');
const { config } = require('../config/env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (error) => {
  // Erros de conexão ociosas não devem derrubar o processo.
  console.error('[db/postgres] erro no pool:', error.message);
});

/** Converte placeholders posicionais `?` para o formato do Postgres (`$1`, `$2`, ...). */
function translate(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => `$${++index}`);
}

async function run(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return { changes: result.rowCount };
}

async function get(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return result.rows[0];
}

async function all(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return result.rows;
}

async function exec(sql) {
  await pool.query(sql);
}

async function query(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return { rows: result.rows, rowCount: result.rowCount };
}

async function insertReturningId(sql, params = []) {
  const result = await pool.query(`${translate(sql)} RETURNING id`, params);
  return result.rows[0] ? result.rows[0].id : undefined;
}

function close() {
  return pool.end();
}

module.exports = {
  dialect: 'postgres',
  pool,
  run,
  get,
  all,
  exec,
  query,
  insertReturningId,
  close
};
