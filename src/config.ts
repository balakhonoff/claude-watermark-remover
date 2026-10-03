/**
 * Everything the server needs comes from the environment: the host (Claude Desktop, Claude Code, Codex, Cursor)
 * stores these values and starts the process with them. Nothing is written to disk by this program.
 */

export type Reasoning = "none" | "low" | "medium" | "high";

export interface ModelPreset {
  /** OpenRouter model id. */
  model: string;
  /** Reasoning effort to request; "none" sends no reasoning field. */
  reasoning: Reasoning;
  /** Upper bound for the completion, including reasoning tokens when the model reasons. */
  maxTokens: number;
  /** Provider slugs to pin (OpenRouter `provider.only`); empty means any provider. */
  providers: string[];
  /** Free models answer 429 when busy: how many times to wait and ask again. */
  busyRetries: number;
  /** Why this preset exists, shown in the tool description. */
  note: string;
}

/**
 * Presets measured on 2026-10-03 with the production prompt on a 1,316-character text. The paid default is the
 * model of the published SynthID test (painintheagent.com/blog/text-watermark-removal-retest/).
 */
export const PRESETS: Record<string, ModelPreset> = {
  "qwen/qwen3.7-plus": { model: "qwen/qwen3.7-plus", reasoning: "none", maxTokens: 16_000, providers: ["alibaba"], busyRetries: 0,
    note: "the model of the published test: 2–10 s, about $0.001 per 1,000 characters" },
  "qwen/qwen3.8-27b:free": { model: "qwen/qwen3.8-27b:free", reasoning: "low", maxTokens: 16_000, providers: [], busyRetries: 3,
    note: "free; needs low reasoning (46 s, 81% of five-word sequences replaced); often busy" },
  "nvidia/nemotron-3-super-120b-a12b:free": { model: "nvidia/nemotron-3-super-120b-a12b:free", reasoning: "low", maxTokens: 16_000, providers: [], busyRetries: 3,
    note: "free; 12–25 s, 63–78% replaced; only with OpenRouter's 'free endpoints may train on inputs' setting on" },
};

export const DEFAULT_MODEL = "qwen/qwen3.7-plus";

export interface Config {
  apiKey: string;
  baseUrl: string;
  preset: ModelPreset;
  temperature: number;
}

export class ConfigError extends Error {}

const reasoningValues: Reasoning[] = ["none", "low", "medium", "high"];

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new ConfigError("OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/settings/keys and put it in the server's environment.");
  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/u, "");
  const model = env.WATERMARK_MODEL?.trim() || DEFAULT_MODEL;
  const known = PRESETS[model];
  const reasoningEnv = env.WATERMARK_REASONING?.trim() as Reasoning | undefined;
  if (reasoningEnv && !reasoningValues.includes(reasoningEnv)) throw new ConfigError(`WATERMARK_REASONING must be one of ${reasoningValues.join(", ")}.`);
  const preset: ModelPreset = known
    ? { ...known, ...(reasoningEnv ? { reasoning: reasoningEnv } : {}) }
    : { model, reasoning: reasoningEnv ?? (model.endsWith(":free") ? "low" : "none"), maxTokens: 16_000, providers: [], busyRetries: model.endsWith(":free") ? 3 : 0,
        note: "a model without a measured preset; check the result" };
  const providersEnv = env.WATERMARK_PROVIDERS?.trim();
  if (providersEnv !== undefined) preset.providers = providersEnv ? providersEnv.split(",").map(value => value.trim()).filter(Boolean) : [];
  const temperature = env.WATERMARK_TEMPERATURE ? Number(env.WATERMARK_TEMPERATURE) : 0.7;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new ConfigError("WATERMARK_TEMPERATURE must be a number between 0 and 2.");
  return { apiKey, baseUrl, preset, temperature };
}
