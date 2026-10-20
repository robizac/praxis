import { Plugin } from '@opencode/plugin';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Plugin de tools específicas do PRAXIS.
 *
 * Por que existe: rodar as migrações de forma isolada (sem tocar no
 * `praxis.db` de dev) é uma verificação repetitiva do projeto. Em vez de o
 * agente reinventar o script toda vez, ele chama uma tool com interface clara.
 *
 * Segurança: a tool usa `PRAXIS_DB_FILE` para apontar as migrações a um banco
 * temporário e descartável — nunca ao banco de desenvolvimento.
 */

type MigrationResult = {
  ok: boolean;
  /** Validação é sempre no dialeto SQLite (a tool força SQLite). */
  dialect: 'sqlite';
  applied: string[];
  total: number;
  upToDate?: boolean;
  error?: string;
  stdout: string;
  stderr: string;
};

async function runMigrationsIsolated(projectDir: string): Promise<MigrationResult> {
  const dir = await mkdtemp(join(tmpdir(), 'praxis-migrate-check-'));
  const dbFile = join(dir, 'praxis.db');

  try {
    const { stdout, stderr } = await execFileAsync('node', ['scripts/migrate.js'], {
      cwd: projectDir,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        DATABASE_URL: '',
        PRAXIS_DB_FILE: dbFile
      },
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024
    });

    // O scripts/migrate.js imprime, em caso de sucesso:
    //   "Migrações aplicadas (sqlite): 001_init, 002_auth, ..."
    //   "Banco já atualizado (sqlite). Nada a migrar."
    // Obs.: `src/db/index.js` também loga "[db] migrações aplicadas (<dialect>): ..."
    // antes; por isso pegamos a ÚLTIMA linha que casa com o formato.
    const appliedLines = stdout
      .split('\n')
      .map((line) => /Migrações aplicadas \([^)]*\):\s*(.+)/i.exec(line))
      .filter((m): m is RegExpExecArray => m !== null);

    const alreadyUpToDate = /Nada a migrar/i.test(stdout);
    const applied = appliedLines.length
      ? appliedLines[appliedLines.length - 1][1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Guarda de isolamento: o contrato é que `PRAXIS_DB_FILE` aponte as
    // migrações para o banco temporário. Se o arquivo não foi criado, algo
    // deixou de honrar o override (ex.: refactor em src/db/sqlite.js) e o
    // script pode ter migrado o banco de dev — falhamos alto.
    if (!existsSync(dbFile)) {
      return {
        ok: false,
        dialect: 'sqlite',
        applied: [],
        total: 0,
        error:
          'banco temporário não foi criado; PRAXIS_DB_FILE pode ter sido ignorado ' +
          '(verifique src/db/sqlite.js)',
        stdout,
        stderr
      };
    }

    return {
      ok: true,
      dialect: 'sqlite',
      applied,
      total: applied.length,
      upToDate: alreadyUpToDate,
      stdout,
      stderr
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      dialect: 'sqlite',
      applied: [],
      total: 0,
      error: err.message ?? 'falha ao rodar migrações',
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? ''
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export default Plugin.define({
  id: 'praxis.migrations',
  setup: async (ctx) => {
    const projectDir = ctx.location.directory;

    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'praxis_check_migrations',
        description:
          'Valida as migrações do PRAXIS num banco SQLite TEMPORÁRIO e isolado ' +
          '(não toca no praxis.db de desenvolvimento). ATENÇÃO: valida só o dialeto ' +
          'SQLite, não o Postgres. Retorna as migrações aplicadas e se o schema ' +
          'sobe sem erro. Use após alterar arquivos em src/db/migrations/.',
        input: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        options: { codemode: false },
        execute: async () => {
          const result = await runMigrationsIsolated(projectDir);
          return { content: JSON.stringify(result, null, 2) };
        }
      });
    });
  }
});
