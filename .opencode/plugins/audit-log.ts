import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin";

/**
 * Plugin de auditoria local do PRAXIS.
 *
 * Por que existe: queremos um registro local (e descartável) de duas coisas
 * que acontecem muito durante o desenvolvimento:
 *
 * 1. Comandos de shell que mexem no servidor de dev — para conferir depois o
 *    que foi executado (ex.: quem subiu o servidor, em que porta).
 * 2. Edições de arquivo bem-sucedidas — para ter um rastro de quais tools
 *    alteraram o código e se terminaram.
 *
 * Os logs são escritos em `logs/` (fora do versionamento) e são apenas
 * observabilidade local: NÃO bloqueiam nada. Hooks devem ser rápidos e
 * tolerantes a erro.
 */

const SERVER_HINTS = ["src/http/server.js", "npm run dev", "scripts/migrate.js"];

async function appendJsonLine(logDir: string, file: string, entry: unknown): Promise<void> {
  try {
    await mkdir(logDir, { recursive: true });
    await appendFile(join(logDir, file), JSON.stringify(entry) + "\n");
  } catch (error) {
    // Hook nunca deve derrubar uma tool por falha de log.
    console.error("[praxis.audit-log] não consegui escrever o log:", error);
  }
}

export default Plugin.define({
  id: "praxis.audit-log",
  setup: async (ctx) => {
    const logDir = join(ctx.location.directory, "logs");

    // Antes de rodar um comando de shell que pareça envolver o servidor.
    await ctx.tool.hook("execute.before", async (event) => {
      const tool = (event as { tool?: string }).tool;
      if (tool !== "bash" && tool !== "shell") {
        return;
      }

      const input = (event as { input?: { command?: string } }).input;
      const command = input?.command ?? "";
      if (!SERVER_HINTS.some((hint) => command.includes(hint))) {
        return;
      }

      await appendJsonLine(logDir, "plugin-shell.log", {
        timestamp: new Date().toISOString(),
        sessionID: (event as { sessionID?: string }).sessionID,
        tool,
        status: "requested",
        command,
      });
    });

    // Depois de cada edição/escrita/patch bem-sucedida.
    await ctx.tool.hook("execute.after", async (event) => {
      const tool = (event as { tool?: string }).tool;
      if (tool !== "edit" && tool !== "write" && tool !== "patch") {
        return;
      }

      const status = (event as { status?: string }).status;
      if (status !== "completed") {
        return;
      }

      const input = (event as { input?: { filePath?: string; path?: string } }).input;
      const file = input?.filePath ?? input?.path ?? "(desconhecido)";

      await appendJsonLine(logDir, "plugin-tools.log", {
        timestamp: new Date().toISOString(),
        sessionID: (event as { sessionID?: string }).sessionID,
        tool,
        status: "completed",
        file,
      });
    });
  },
});
