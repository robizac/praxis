'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'praxis-backup-test-'));
const dbFile = path.join(workDir, 'praxis.db');
const backupDir = path.join(workDir, 'backups');

// Precisa vir antes de carregar o banco: `PRAXIS_DB_FILE` tem precedência.
process.env.PRAXIS_DB_FILE = dbFile;

const db = require('../src/db');
const usersRepo = require('../src/repositories/users.repo');

function runScript(script, args) {
  const output = execFileSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', PRAXIS_DB_FILE: dbFile },
    encoding: 'utf8'
  });
  return JSON.parse(output.trim().split('\n').pop());
}

test('backup: gera arquivo e o teste de restauração valida o conteúdo', async () => {
  await db.initDb();
  const user = await usersRepo.create({
    email: `backup-${Date.now()}@example.com`,
    passwordHash: 'x',
    name: 'Backup'
  });
  assert.ok(user.id);
  await db.close();

  const backup = runScript('scripts/backup.js', ['--out', backupDir, '--retention', '2']);

  assert.equal(backup.ok, true);
  assert.equal(backup.dialect, 'sqlite');
  assert.ok(fs.existsSync(backup.file));
  assert.ok(backup.sizeBytes > 0);

  const restored = runScript('scripts/backup-restore.js', ['--file', backup.file]);

  assert.equal(restored.ok, true);
  assert.equal(restored.integrity, 'ok');
  assert.ok(restored.migrations >= 1);
  assert.ok(restored.users >= 1);
  assert.ok(restored.tables >= 10);
});

test('backup: rotação mantém só os arquivos mais recentes', async () => {
  const first = runScript('scripts/backup.js', ['--out', backupDir, '--retention', '1']);
  const second = runScript('scripts/backup.js', ['--out', backupDir, '--retention', '1']);

  assert.notEqual(first.file, second.file);

  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith('praxis-') && name.endsWith('.db'));

  assert.equal(files.length, 1);
  assert.equal(files[0], path.basename(second.file));
});

test.after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});
