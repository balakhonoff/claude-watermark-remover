/**
 * The one network call this program makes: OpenRouter's chat completions endpoint, with the user's own key.
 * No other host is contacted. A fake key with a configured OPENROUTER_BASE_URL (an API gateway) works the same way.
 */
import { CompletionTokenLimitError } from "./completion-errors.js";
import type { Config } from "./config.js";
import type { StageCompleter, StageRequest } from "./core.js";

/** Seed of the published test; with sampling it keeps the retry's draw distinct from the first one. */
const SEED = 20260817;
const REQUEST_TIMEOUT_MS = 300_000;
const BUSY_WAIT_MS = [5_000, 15_000, 30_000];

export class ModelCallError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface CallRecord {
  model: string;
  provider?: string;
  seconds: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  busyWaits: number;
}

export interface OpenRouterClient {
  complete: StageCompleter;
  /** Every completed call of this client, in order. */
  calls: CallRecord[];
}

type Fetch = typeof fetch;

export function createClient(config: Config, fetchImpl: Fetch = fetch, sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): OpenRouterClient {
  const calls: CallRecord[] = [];
  const complete: StageCompleter = async (request: StageRequest) => {
    const { preset } = config;
    const body: Record<string, unknown> = {
      model: preset.model,
      messages: [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.userContent }],
      temperature: request.temperature ?? config.temperature,
      seed: SEED,
      max_tokens: Math.max(request.maxTokens ?? 4096, preset.reasoning === "none" ? 0 : preset.maxTokens),
      ...(preset.reasoning === "none" ? {} : { reasoning: { effort: preset.reasoning } }),
      ...(preset.providers.length ? { provider: { only: preset.providers } } : {}),
    };
    let busyWaits = 0;
    for (;;) {
      const started = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "HTTP-Referer": "https://github.com/krllagent/claude-watermark-remover", "X-Title": "claude-watermark-remover" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new ModelCallError(`OpenRouter could not be reached: ${error instanceof Error ? error.message : String(error)}`);
      }
      const text = await response.text();
      if (response.status === 429 && busyWaits < preset.busyRetries) {
        await sleep(BUSY_WAIT_MS[Math.min(busyWaits, BUSY_WAIT_MS.length - 1)]);
        busyWaits += 1;
        continue;
      }
      if (!response.ok) throw new ModelCallError(describeFailure(response.status, text, preset.model), response.status);
      let payload: any;
      try { payload = JSON.parse(text); } catch { throw new ModelCallError("OpenRouter returned something that is not JSON."); }
      if (payload.error) throw new ModelCallError(describeFailure(payload.error.code ?? response.status, text, preset.model));
      const choice = payload.choices?.[0];
      const content: string = choice?.message?.content ?? "";
      const usage = payload.usage ?? {};
      calls.push({ model: payload.model ?? preset.model, provider: payload.provider, seconds: (Date.now() - started) / 1000, promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens, reasoningTokens: usage.completion_tokens_details?.reasoning_tokens, costUsd: usage.cost, busyWaits });
      if (choice?.finish_reason === "length" || (!content.trim() && choice?.finish_reason !== "stop")) throw new CompletionTokenLimitError(request.stage);
      if (!content.trim()) throw new ModelCallError(`${preset.model} returned an empty answer (finish reason: ${choice?.finish_reason ?? "unknown"}).`);
      return { content };
    }
  };
  return { complete, calls };
}

function describeFailure(status: number, text: string, model: string): string {
  let raw = "";
  try { raw = JSON.parse(text)?.error?.metadata?.raw ?? JSON.parse(text)?.error?.message ?? ""; } catch { /* not JSON */ }
  if (status === 429) return `${model} is busy right now (OpenRouter 429). Free models are shared: wait a minute and try again, or set WATERMARK_MODEL to a paid model such as qwen/qwen3.7-plus.`;
  if (status === 401) return "OpenRouter rejected the key (401). Check OPENROUTER_API_KEY.";
  if (status === 402) return "OpenRouter reports no credit (402). Add credit at https://openrouter.ai/settings/credits or use a free model.";
  if (status === 404 && /data policy|training/iu.test(raw)) return `${model} is not available under your OpenRouter privacy settings: this free endpoint may train on inputs. Allow that at https://openrouter.ai/settings/privacy, or choose another model.`;
  return `OpenRouter returned HTTP ${status} for ${model}${raw ? `: ${raw.slice(0, 200)}` : ""}.`;
}
