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
 * This program runs on OpenRouter's free models only. Free models come and go (the first default of this program
 * stopped being free two days after it was measured), so the default is a list tried in order, and any id ending
 * in ":free" is accepted. Measurements: docs/free-models.md.
 */
export const PRESETS: Record<string, ModelPreset> = {
  "inclusionai/ling-3.0-flash-sante:free": { model: "inclusionai/ling-3.0-flash-sante:free", reasoning: "low", maxTokens: 16_000, providers: [], busyRetries: 3,
    note: "free; measured 2026-10-05 on three runs: 61–216 s, 70%, 70% and 87% of five-word sequences replaced, layout kept" },
  "nvidia/nemotron-3-super-120b-a12b:free": { model: "nvidia/nemotron-3-super-120b-a12b:free", reasoning: "low", maxTokens: 16_000, providers: [], busyRetries: 3,
    note: "free; measured 2026-10-03: 12–25 s, 63–78% replaced; only with OpenRouter's 'free endpoints may train on inputs' setting on" },
};

/** Tried in this order until one returns a usable rewrite. */
export const DEFAULT_MODELS = ["inclusionai/ling-3.0-flash-sante:free", "nvidia/nemotron-3-super-120b-a12b:free"];
export const DEFAULT_MODEL = DEFAULT_MODELS[0];

export interface Config {
  apiKey: string;
  baseUrl: string;
  preset: ModelPreset;
  /** Further free models, tried in order when the one before fails. */
  fallbacks: ModelPreset[];
  temperature: number;
}

export class ConfigError extends Error {}

const reasoningValues: Reasoning[] = ["none", "low", "medium", "high"];

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new ConfigError("OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/settings/keys and put it in the server's environment.");
  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1").replace(/\/+$/u, "");
  // One id or a comma-separated list. OpenRouter's free list changes often, so any free id is accepted, not only the measured ones.
  const models = (env.WATERMARK_MODEL?.trim() ? env.WATERMARK_MODEL.split(",").map(value => value.trim()).filter(Boolean) : DEFAULT_MODELS);
  const paid = models.find(model => !model.endsWith(":free"));
  if (paid || !models.length) throw new ConfigError(`WATERMARK_MODEL must name OpenRouter's free models (ids ending in ":free", one or several separated by commas), for example ${DEFAULT_MODEL}. See docs/free-models.md.`);
  const reasoningEnv = env.WATERMARK_REASONING?.trim() as Reasoning | undefined;
  if (reasoningEnv && !reasoningValues.includes(reasoningEnv)) throw new ConfigError(`WATERMARK_REASONING must be one of ${reasoningValues.join(", ")}.`);
  const presets = models.map((model): ModelPreset => PRESETS[model]
    ? { ...PRESETS[model], ...(reasoningEnv ? { reasoning: reasoningEnv } : {}) }
    : { model, reasoning: reasoningEnv ?? "low", maxTokens: 16_000, providers: [], busyRetries: 3, note: "a free model without a measured preset; check the result" });
  const [preset, ...fallbacks] = presets;
  const providersEnv = env.WATERMARK_PROVIDERS?.trim();
  if (providersEnv !== undefined) preset.providers = providersEnv ? providersEnv.split(",").map(value => value.trim()).filter(Boolean) : [];
  const temperature = env.WATERMARK_TEMPERATURE ? Number(env.WATERMARK_TEMPERATURE) : 0.7;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new ConfigError("WATERMARK_TEMPERATURE must be a number between 0 and 2.");
  return { apiKey, baseUrl, preset, fallbacks, temperature };
}
