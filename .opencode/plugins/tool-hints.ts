import { Plugin } from "@opencode/plugin";

/**
 * Plugin de TRANSFORM (não é hook!).
 *
 * Diferença central do capítulo:
 *   - Hook  → intercepta uma OPERAÇÃO viva (ex.: antes/depois de rodar uma tool).
 *   - Transform → muda a DEFINIÇÃO que o OpenCode expõe ao modelo (descrição,
 *     input, etc.), sem tocar na implementação da tool.
 *
 * Aqui só enriquecemos a descrição da tool `praxis_check_migrations` (definida
 * em `praxis-migrations.ts`) com um lembrete operacional. O comportamento da
 * tool permanece idêntico — o que muda é o texto que o modelo lê.
 */

export default Plugin.define({
  id: "praxis.tool-hints",
  setup: async (ctx) => {
    await ctx.tool.transform((tools) => {
      tools.update("praxis_check_migrations", (tool) => {
        tool.description +=
          "\n\nEste check valida APENAS o dialeto SQLite. O Postgres não é exercitado " +
          "aqui — se você mudou o SQL de um dialeto, confira o outro manualmente.";
      });
    });
  },
});
