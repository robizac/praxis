'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const usersRepo = require('../src/repositories/users.repo');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const emailArg = (() => {
  const i = args.indexOf('--email');
  if (i === -1) return null;
  return args[i + 1];
})();

async function main() {
  await db.initDb();

  let owner;
  if (emailArg) {
    const email = String(emailArg).trim().toLowerCase();
    owner = await usersRepo.findByEmail(email);
    if (!owner) {
      throw new Error(`Usuário não encontrado para migração: ${email}`);
    }
  } else {
    owner = await db.get('SELECT * FROM users ORDER BY created_at ASC LIMIT 1');
  }

  if (!owner) {
    throw new Error('Nenhum usuário cadastrado. Cadastre um usuário ou passe --email <email>.');
  }

  const items = await db.get('SELECT COUNT(*) AS total FROM praxis_items WHERE user_id IS NULL');
  const reminders = await db.get('SELECT COUNT(*) AS total FROM reminders WHERE user_id IS NULL');
  const ownerId = owner.id;

  console.log(`Dono da migração: ${owner.email} (${ownerId}) ${dryRun ? '[dry-run]' : ''}`);
  console.log(`Órfãos: praxis_items=${items ? items.total : 0}, reminders=${reminders ? reminders.total : 0}`);

  if (!dryRun) {
    await db.run('UPDATE praxis_items SET user_id = ? WHERE user_id IS NULL', [ownerId]);
    await db.run('UPDATE reminders SET user_id = ? WHERE user_id IS NULL', [ownerId]);
  }

  const reviewsPath = path.join(__dirname, '..', 'weekly_reviews.json');
  let imported = 0;
  if (fs.existsSync(reviewsPath)) {
    let content = '';
    try {
      content = fs.readFileSync(reviewsPath, 'utf-8');
    } catch (error) {
      console.warn('[migrate-legacy] Não foi possível ler weekly_reviews.json:', error.message);
      content = '[]';
    }

    let parsed = [];
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      console.warn('[migrate-legacy] weekly_reviews.json inválido, pulando importação.', error.message);
      parsed = [];
    }

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const respostas = item?.respostas || {};
        if (!respostas.executei || !respostas.trouxe_paz || !respostas.gerou_peso || !respostas.deve_sair) {
          continue;
        }
        if (!dryRun) {
          await db.run(
            `INSERT INTO weekly_reviews (user_id, executei, trouxe_paz, gerou_peso, deve_sair, insights, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              ownerId,
              respostas.executei,
              respostas.trouxe_paz,
              respostas.gerou_peso,
              respostas.deve_sair,
              item?.insights || null,
              item?.created_at || new Date().toISOString()
            ]
          );
        }
        imported += 1;
      }
    }
  }

  console.log(`Revisões importadas do JSON: ${imported}`);
  console.log(dryRun ? 'Dry-run concluído: nada foi alterado.' : 'Migração concluída.');
  await db.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
