/**
 * MCP server over stdio (the default) or a one-shot CLI (`--text-file <path>` / `--stdin`).
 * Reads OPENROUTER_API_KEY and the WATERMARK_* settings from the environment; see README.md.
 */
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConfigError, PRESETS, readConfig, type Config } from "./config.js";
import { STYLE_GUIDANCE_MAX_CHARS } from "./core.js";
import { MAX_CHARS, MIN_CHARS, RemovalError, removeWatermark } from "./remove.js";

const VERSION = "0.1.0";

function describeModel(config: Config): string {
  return `${config.preset.model} (${config.preset.note})`;
}

async function serve(): Promise<void> {
  let config: Config | undefined;
  let configError: string | undefined;
  try { config = readConfig(); } catch (error) { configError = error instanceof ConfigError ? error.message : String(error); }
  const instructions = "Removes a statistical AI text watermark (SynthID-style, as used by Claude and Gemini) by rewriting the wording with " +
    (config ? describeModel(config) : "the configured OpenRouter model") +
    ", paid with the user's own OpenRouter key. One model draft; a second only when a check of length, layout or wording fails. " +
    "No second model checks the meaning: tell the user to compare the result with the source. Use it only when the user asks to remove a watermark or to rewrite a text for that purpose.";
  const server = new McpServer({ name: "claude-watermark-remover", version: VERSION }, { instructions });
  server.registerTool("remove_watermark", {
    title: "Remove the watermark, keep the text",
    description: "Remove a statistical AI watermark without humanizing: one rewrite by one model that is instructed to keep the meaning, structure, formatting and language of the text. Links, quotations, amounts and percentages are masked and return unchanged. Returns the rewritten text with novelty_percent (share of five-word sequences replaced; the target is 80%), layout_kept, model_calls and the cost OpenRouter reported. A rewrite that breaks the layout or leaves 70–140% of the source length is an error. No meaning check and no AI score are run: compare the result with the source. Texts of 750+ characters give a reliable share; shorter texts are processed but the share is coarse.",
    inputSchema: {
      text: z.string().min(MIN_CHARS).max(MAX_CHARS).describe(`${MIN_CHARS}–${MAX_CHARS} characters of prose. Lists and headings are fine; code and tables are not.`),
      style_guidance: z.string().max(STYLE_GUIDANCE_MAX_CHARS).optional().describe(`The user's own writing-style rules, if any: a style skill, custom instructions or a style named in the conversation. Pass them complete and in their original wording, up to ${STYLE_GUIDANCE_MAX_CHARS} characters. They shape wording only; the model is told not to let them change facts, terms or numbers, and nothing verifies that. Omit when no style rules exist.`),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ text, style_guidance }) => {
    if (!config) return { isError: true, content: [{ type: "text", text: configError ?? "The server is not configured." }] };
    try {
      const result = await removeWatermark(text, config, { styleGuidance: style_guidance });
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
    } catch (error) {
      const message = error instanceof RemovalError ? error.message : "The rewrite failed for a reason this program did not expect. Try again; if it repeats, report it with the text length and the model.";
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });
  server.registerTool("get_configuration", {
    title: "Read the configured model",
    description: "Read which OpenRouter model, reasoning setting and temperature this server uses, and the measured presets available. Makes no model call.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const payload = config
      ? { model: config.preset.model, reasoning: config.preset.reasoning, temperature: config.temperature, providers: config.preset.providers, base_url: config.baseUrl, note: config.preset.note,
          presets: Object.values(PRESETS).map(preset => ({ model: preset.model, reasoning: preset.reasoning, note: preset.note })),
          hosted_alternative: "https://painintheagent.com — the same rewrite without keys, as a connector for claude.ai on the web and phones and as a web tool, plus the Humanizer." }
      : { error: configError };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload as Record<string, unknown> };
  });
  await server.connect(new StdioServerTransport());
  process.stdin.on("end", () => process.exit(0));
}

async function cli(args: string[]): Promise<void> {
  const fileIndex = args.indexOf("--text-file");
  const text = fileIndex >= 0 ? readFileSync(args[fileIndex + 1]!, "utf8") : readFileSync(0, "utf8");
  const styleIndex = args.indexOf("--style-file");
  const styleGuidance = styleIndex >= 0 ? readFileSync(args[styleIndex + 1]!, "utf8") : undefined;
  const config = readConfig();
  const result = await removeWatermark(text, config, { styleGuidance });
  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(result.text + "\n");
    process.stderr.write(`${result.novelty_percent}% of five-word sequences replaced (target ${result.target_percent}%), layout ${result.layout_kept ? "kept" : "changed"}, ` +
      `${result.model_calls} model call${result.model_calls === 1 ? "" : "s"} to ${result.model}${result.provider ? ` on ${result.provider}` : ""}, ${result.seconds} s` +
      `${result.cost_usd !== undefined ? `, $${result.cost_usd}` : ""}${result.retry_reason ? `; second draft because ${result.retry_reason}` : ""}\n`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`claude-watermark-remover ${VERSION}
  (no arguments)                  run as an MCP server over stdio
  --text-file <path> [--json]     rewrite one file and print the result
  --stdin [--json]                rewrite standard input
  --style-file <path>             the user's style rules, applied to wording only
Environment: OPENROUTER_API_KEY (required), WATERMARK_MODEL, WATERMARK_REASONING, WATERMARK_TEMPERATURE, WATERMARK_PROVIDERS, OPENROUTER_BASE_URL.
`);
} else if (args.includes("--text-file") || args.includes("--stdin")) {
  cli(args).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); });
} else {
  serve().catch(() => { process.stderr.write("MCP startup failed. Check the installation.\n"); process.exit(1); });
}
