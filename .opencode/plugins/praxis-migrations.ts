import { Plugin } from "@opencode/plugin";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
  applied: string[];
  total: number;
  error?: string;
  stdout: string;
  stderr: string;
};

async function runMigrationsIsolated(projectDir: string): Promise<MigrationResult> {
  const dir = await mkdtemp(join(tmpdir(), "praxis-migrate-check-"));
  const dbFile = join(dir, "praxis.db");

  try {
    const { stdout, stderr } = await execFileAsync(
      "node",
      ["scripts/migrate.js"],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: "",
          PRAXIS_DB_FILE: dbFile,
        },
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    // O scripts/migrate.js imprime, em caso de sucesso:
    //   "Migrações aplicadas (sqlite): 001_init, 002_auth, ..."
    //   "Banco já atualizado (sqlite). Nada a migrar."
    // Obs.: `src/db/index.js` também loga "[db] migrações aplicadas (<dialect>): ..."
    // antes; por isso pegamos a ÚLTIMA linha que casa com o formato.
    const appliedLines = stdout
      .split("\n")
      .map((line) => /Migrações aplicadas \([^)]*\):\s*(.+)/i.exec(line))
      .filter((m): m is RegExpExecArray => m !== null);

    const alreadyUpToDate = /Nada a migrar/i.test(stdout);
    const applied = appliedLines.length
      ? appliedLines[appliedLines.length - 1][1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return { ok: true, applied, total: applied.length, upToDate: alreadyUpToDate, stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      applied: [],
      total: 0,
      error: err.message ?? "falha ao rodar migrações",
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export default Plugin.define({
  id: "praxis.migrations",
  setup: async (ctx) => {
    const projectDir = ctx.location.directory;

    await ctx.tool.transform((tools) => {
      tools.add({
        name: "praxis_check_migrations",
        description:
          "Roda as migrações do PRAXIS em um banco SQLite temporário e isolado " +
          "(não toca no praxis.db de desenvolvimento). Retorna as migrações " +
          "aplicadas e se o schema sobe sem erro. Use após alterar arquivos em " +
          "src/db/migrations/.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { codemode: false },
        execute: async () => {
          const result = await runMigrationsIsolated(projectDir);
          return { content: JSON.stringify(result, null, 2) };
        },
      });
    });
  },
});
