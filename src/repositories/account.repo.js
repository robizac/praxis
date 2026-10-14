'use strict';

const db = require('../db');

/**
 * Tabelas com dados do usuário, na ordem de exclusão (dependentes primeiro).
 * O `DELETE FROM users` por último limpa qualquer resíduo via ON DELETE CASCADE.
 * A lista é fixa (nomes de tabela não vêm do cliente).
 */
const USER_TABLES = [
  'reminders',
  'praxis_items',
  'weekly_reviews',
  'ai_usage',
  'ai_credentials',
  'telegram_chats',
  'telegram_link_codes',
  'subscriptions',
  'sessions',
  'password_resets',
  'email_verifications'
];

/**
 * Exclui todos os dados do usuário (LGPD — direito à eliminação).
 * Executa as exclusões em ordem de dependência e remove o usuário por último,
 * para que uma falha parcial nunca deixe órfãos. Retorna a contagem por tabela.
 */
async function purgeUser(userId) {
  const deleted = {};
  for (const table of USER_TABLES) {
    const result = await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
    deleted[table] = result.changes;
  }
  const userResult = await db.run('DELETE FROM users WHERE id = ?', [userId]);
  deleted.users = userResult.changes;
  return deleted;
}

/**
 * Anonimiza o log de auditoria do usuário (mantido por segurança/obrigação legal,
 * sem dado pessoal). Ver retenção em docs/07.
 */
async function anonymizeAuditLog(userId) {
  const result = await db.run(
    'UPDATE audit_log SET user_id = NULL, ip = NULL, metadata = NULL WHERE user_id = ?',
    [userId]
  );
  return result.changes;
}

module.exports = { USER_TABLES, purgeUser, anonymizeAuditLog };
