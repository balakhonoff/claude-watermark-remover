import { describe, expect, it } from "vitest";
import { CompletionTokenLimitError } from "../src/completion-errors.js";
import { ConfigError, DEFAULT_MODEL, DEFAULT_MODELS, PRESETS, readConfig } from "../src/config.js";
import { removeWatermark, RemovalError } from "../src/remove.js";
import { createClient, ModelCallError } from "../src/openrouter.js";

const env = { OPENROUTER_API_KEY: "sk-or-fictional" };
const request = { stage: "paraphrase-draft" as const, systemPrompt: "Rewrite.", userContent: '{"sourceText":"Fixture."}', maxTokens: 4096 };
const answer = (content: string, finish = "stop", extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "someone/new-model:free", provider: "ModelRun", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 }, ...extra }), { status: 200 });

describe("configuration from the environment", () => {
  it("requires the key, defaults to a free model and takes a base URL for a gateway", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    const config = readConfig(env);
    expect(config.preset).toMatchObject({ model: DEFAULT_MODELS[0], reasoning: "low", providers: [], busyRetries: 3 });
    expect(config.fallbacks.map(preset => preset.model)).toEqual(DEFAULT_MODELS.slice(1));
    expect(DEFAULT_MODELS.length).toBeGreaterThan(1);
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.temperature).toBe(0.7);
    expect(readConfig({ ...env, OPENROUTER_BASE_URL: "http://127.0.0.1:8787/openrouter/api/v1/" }).baseUrl).toBe("http://127.0.0.1:8787/openrouter/api/v1");
  });

  it("knows the measured free presets and treats an unknown :free model as a reasoning model with busy retries", () => {
    expect(readConfig({ ...env, WATERMARK_MODEL: DEFAULT_MODELS[1] }).preset).toMatchObject({ model: DEFAULT_MODELS[1], reasoning: "low", busyRetries: 3 });
    expect(readConfig({ ...env, WATERMARK_MODEL: DEFAULT_MODELS[1] }).fallbacks).toEqual([]);
    const listed = readConfig({ ...env, WATERMARK_MODEL: " someone/a:free , someone/b:free " });
    expect([listed.preset.model, ...listed.fallbacks.map(preset => preset.model)]).toEqual(["someone/a:free", "someone/b:free"]);
    expect(() => readConfig({ ...env, WATERMARK_MODEL: "someone/a:free,qwen/qwen3.7-plus" })).toThrow(/free models/u);
    expect(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free" }).preset).toMatchObject({ reasoning: "low", busyRetries: 3, providers: [] });
    expect(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free", WATERMARK_REASONING: "medium", WATERMARK_PROVIDERS: "modelrun" }).preset).toMatchObject({ reasoning: "medium", providers: ["modelrun"] });
    // Free models only: a paid id is a configuration error, and no preset or message names one.
    for (const paid of ["someone/new-model", "qwen/qwen3.7-plus", "openai/gpt-5"]) expect(() => readConfig({ ...env, WATERMARK_MODEL: paid })).toThrow(/free models/u);
    for (const model of Object.keys(PRESETS)) expect(model.endsWith(":free")).toBe(true);
    expect(DEFAULT_MODEL.endsWith(":free")).toBe(true);
    expect(() => readConfig({ ...env, WATERMARK_REASONING: "max" })).toThrow(ConfigError);
    expect(() => readConfig({ ...env, WATERMARK_TEMPERATURE: "3" })).toThrow(ConfigError);
  });
});

describe("the OpenRouter call", () => {
  it("sends the key, the model, the seed and the reasoning setting, and records the usage", async () => {
    const bodies: any[] = [];
    const client = createClient(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free" }), async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer("Rewritten."); });
    expect(await client.complete(request)).toEqual({ content: "Rewritten." });
    expect(bodies[0]).toMatchObject({ model: "someone/new-model:free", seed: 20260817, temperature: 0.7, reasoning: { effort: "low" }, max_tokens: 16_000 });
    expect(bodies[0].provider).toBeUndefined();
    expect(client.calls[0]).toMatchObject({ provider: "ModelRun", costUsd: 0, busyWaits: 0 });

    const sent: any[] = [];
    const pinned = createClient(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free", WATERMARK_PROVIDERS: "modelrun", WATERMARK_REASONING: "none" }), async (url, init) => { sent.push([url, init?.headers, JSON.parse(String(init?.body))]); return answer("Rewritten."); });
    await pinned.complete(request);
    expect(sent[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sent[0][1]).toMatchObject({ Authorization: "Bearer sk-or-fictional" });
    expect(sent[0][2]).toMatchObject({ model: "someone/new-model:free", provider: { only: ["modelrun"] }, max_tokens: 4096 });
    expect(sent[0][2].reasoning).toBeUndefined();
  });

  it("waits and asks again when a free model is busy, then gives up with a plain message", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const busy = () => new Response(JSON.stringify({ error: { code: 429, message: "Provider returned error", metadata: { raw: "temporarily rate-limited upstream" } } }), { status: 429 });
    const client = createClient(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free" }), async () => { attempts += 1; return attempts < 3 ? busy() : answer("Rewritten."); }, async ms => { waits.push(ms); });
    expect(await client.complete(request)).toEqual({ content: "Rewritten." });
    expect(waits).toEqual([5_000, 15_000]);
    expect(client.calls[0].busyWaits).toBe(2);

    const alwaysBusy = createClient(readConfig(env), async () => busy(), async () => {});
    const failure = await alwaysBusy.complete(request).catch((error: Error) => error.message);
    expect(failure).toMatch(/busy right now/u);
    expect(failure).toMatch(/another free model/u);
    expect(failure).not.toMatch(/paid|qwen3\.7/u);
  });

  it("explains a privacy-setting refusal and a billing refusal, and reports a cut-off answer as a token limit", async () => {
    const refused = new Response(JSON.stringify({ error: { message: "0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. Free model training violation (account settings)", code: 404 } }), { status: 404 });
    await expect(createClient(readConfig(env), async () => refused).complete(request)).rejects.toThrow(/privacy settings/u);
    await expect(createClient(readConfig(env), async () => new Response("{}", { status: 402 })).complete(request)).rejects.toThrow(/billing reason/u);
    await expect(createClient(readConfig(env), async () => answer("", "length")).complete(request)).rejects.toBeInstanceOf(CompletionTokenLimitError);
    await expect(createClient(readConfig(env), async () => answer("", "stop")).complete(request)).rejects.toBeInstanceOf(ModelCallError);
  });
});

describe("the list of free models", () => {
  const source = "The committee reviewed the proposal in detail and concluded that the timeline was realistic, provided that the supplier confirmed delivery dates before the end of the quarter. It asked for a written update every second week.";
  const rewrite = "After a detailed look at the proposal, the committee judged the timeline realistic, as long as the supplier confirms delivery dates before the quarter ends. A written update every second week was requested as well.";
  const reply = (model: string, content: string) => new Response(JSON.stringify({ model, provider: "Fixture", choices: [{ finish_reason: "stop", message: { content } }], usage: { cost: 0 } }), { status: 200 });
  const gone = (model: string) => new Response(JSON.stringify({ error: { code: 404, message: `This model is unavailable for free: ${model}` } }), { status: 404 });

  it("moves to the next free model when one is withdrawn, busy or closed by a privacy setting, and says which were skipped", async () => {
    const asked: string[] = [];
    const config = readConfig({ ...env, WATERMARK_MODEL: "gone/a:free,busy/b:free,works/c:free" });
    const result = await removeWatermark(source, config, { sleep: async () => {}, fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string; asked.push(model);
      if (model === "gone/a:free") return gone(model);
      if (model === "busy/b:free") return new Response(JSON.stringify({ error: { code: 429, message: "busy" } }), { status: 429 });
      return reply(model, JSON.stringify({ rewrittenText: rewrite }));
    }) as typeof fetch });
    expect(result.model).toBe("works/c:free");
    expect(result.cost_usd).toBe(0);
    expect(result.skipped_models).toHaveLength(2);
    expect(result.skipped_models![0]).toMatch(/^gone\/a:free/u);
    expect(result.skipped_models![1]).toMatch(/^busy\/b:free is busy right now/u);
    expect(new Set(asked)).toEqual(new Set(["gone/a:free", "busy/b:free", "works/c:free"]));
  });

  it("names every model and its reason when none of them answers", async () => {
    const config = readConfig({ ...env, WATERMARK_MODEL: "gone/a:free,gone/b:free" });
    const failure = await removeWatermark(source, config, { sleep: async () => {}, fetchImpl: (async (_url: unknown, init?: RequestInit) => gone(JSON.parse(String(init?.body)).model)) as typeof fetch }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RemovalError);
    expect((failure as Error).message).toMatch(/None of the 2 free models/u);
    expect((failure as Error).message).toMatch(/gone\/a:free.*gone\/b:free/su);
    expect((failure as Error).message).not.toMatch(/paid|qwen3\.7/u);
  });
});
