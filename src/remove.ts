/** The operation behind the MCP tool and the CLI: one paraphrase with its checks, plus the figures a reader needs. */
import type { Config } from "./config.js";
import { fiveGramNovelty, layoutKept, PipelineValidationError, runSinglePassParaphrase, SINGLE_PASS_NOVELTY_TARGET, STYLE_GUIDANCE_MAX_CHARS } from "./core.js";
import { CompletionTokenLimitError } from "./completion-errors.js";
import { createClient, ModelCallError, type CallRecord } from "./openrouter.js";

export const MIN_CHARS = 100;
export const MAX_CHARS = 10_000;

export interface RemovalResult {
  text: string;
  /** Share of the result's five-word sequences that do not appear in the source, in percent. */
  novelty_percent: number;
  /** The share this tool aims for; below it the result still comes back, with `target_met` false. */
  target_percent: number;
  target_met: boolean;
  /** Paragraphs, lines and list markers of the source are all in place. */
  layout_kept: boolean;
  model: string;
  provider?: string;
  /** Free models that were tried before this one and why each gave nothing, when any did. */
  skipped_models?: string[];
  model_calls: number;
  retry_reason?: string;
  seconds: number;
  /** Sum of OpenRouter's reported cost; 0 for free models, absent when the endpoint reports none. */
  cost_usd?: number;
  /** Characters of style rules applied, when any were passed. */
  style_guidance_chars?: number;
}

export class RemovalError extends Error {}

export async function removeWatermark(text: string, config: Config, options: { styleGuidance?: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<RemovalResult> {
  const length = Array.from(text).length;
  if (length < MIN_CHARS) throw new RemovalError(`The text has ${length} characters; at least ${MIN_CHARS} are needed. Below about 750 characters the replaced share is a coarse measure.`);
  if (length > MAX_CHARS) throw new RemovalError(`The text has ${length} characters; at most ${MAX_CHARS} are processed in one call. Split it at a section boundary.`);
  const style = options.styleGuidance?.trim() ?? "";
  if (Array.from(style).length > STYLE_GUIDANCE_MAX_CHARS) throw new RemovalError(`style_guidance must be at most ${STYLE_GUIDANCE_MAX_CHARS} characters.`);
  const started = Date.now();
  // Free models are busy, withdrawn or closed by a privacy setting without notice: try the configured ones in order.
  const skipped: string[] = [];
  let client: ReturnType<typeof createClient> | undefined, run: Awaited<ReturnType<typeof runSinglePassParaphrase>> | undefined;
  for (const preset of [config.preset, ...config.fallbacks]) {
    const attempt = createClient({ ...config, preset }, options.fetchImpl, options.sleep);
    try {
      run = await runSinglePassParaphrase(text, attempt.complete, style ? { styleGuidance: style, temperature: config.temperature } : { temperature: config.temperature });
      client = attempt;
      break;
    } catch (error) {
      if (error instanceof PipelineValidationError) skipped.push(`${preset.model}: no usable rewrite (${error.message})`);
      else if (error instanceof CompletionTokenLimitError) skipped.push(`${preset.model}: ran out of output tokens while reasoning`);
      else if (error instanceof ModelCallError) skipped.push(error.message.startsWith(preset.model) ? error.message : `${preset.model}: ${error.message}`);
      else throw error;
    }
  }
  if (!run || !client) throw new RemovalError(skipped.length === 1 ? `${skipped[0]} Nothing was returned.` : `None of the ${skipped.length} free models returned a usable rewrite. ${skipped.join(" | ")}`);
  const novelty = fiveGramNovelty(text, run.text);
  const last: CallRecord | undefined = client.calls.at(-1);
  const costs = client.calls.map(call => call.costUsd).filter((value): value is number => typeof value === "number");
  return {
    text: run.text,
    novelty_percent: novelty,
    target_percent: SINGLE_PASS_NOVELTY_TARGET,
    target_met: novelty >= SINGLE_PASS_NOVELTY_TARGET,
    layout_kept: layoutKept(text, run.text),
    model: last?.model ?? config.preset.model,
    ...(last?.provider ? { provider: last.provider } : {}),
    ...(skipped.length ? { skipped_models: skipped } : {}),
    model_calls: run.calls,
    ...(run.retryReason ? { retry_reason: run.retryReason } : {}),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    ...(costs.length ? { cost_usd: Math.round(costs.reduce((sum, value) => sum + value, 0) * 1e6) / 1e6 } : {}),
    ...(style ? { style_guidance_chars: Array.from(style).length } : {}),
  };
}
