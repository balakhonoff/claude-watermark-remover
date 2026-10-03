import { describe, expect, it } from "vitest";
import { CompletionTokenLimitError } from "../src/completion-errors.js";
import { ConfigError, readConfig } from "../src/config.js";
import { createClient, ModelCallError } from "../src/openrouter.js";

const env = { OPENROUTER_API_KEY: "sk-or-fictional" };
const request = { stage: "paraphrase-draft" as const, systemPrompt: "Rewrite.", userContent: '{"sourceText":"Fixture."}', maxTokens: 4096 };
const answer = (content: string, finish = "stop", extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ model: "qwen/qwen3.7-plus", provider: "Alibaba", choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 }, ...extra }), { status: 200 });

describe("configuration from the environment", () => {
  it("requires the key, defaults to the published model and takes a base URL for a gateway", () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    const config = readConfig(env);
    expect(config.preset).toMatchObject({ model: "qwen/qwen3.7-plus", reasoning: "none", providers: ["alibaba"] });
    expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.temperature).toBe(0.7);
    expect(readConfig({ ...env, OPENROUTER_BASE_URL: "http://127.0.0.1:8787/openrouter/api/v1/" }).baseUrl).toBe("http://127.0.0.1:8787/openrouter/api/v1");
  });

  it("knows the measured free presets and treats an unknown :free model as a reasoning model with busy retries", () => {
    expect(readConfig({ ...env, WATERMARK_MODEL: "qwen/qwen3.8-27b:free" }).preset).toMatchObject({ reasoning: "low", busyRetries: 3 });
    expect(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model:free" }).preset).toMatchObject({ reasoning: "low", busyRetries: 3, providers: [] });
    expect(readConfig({ ...env, WATERMARK_MODEL: "someone/new-model" }).preset).toMatchObject({ reasoning: "none", busyRetries: 0 });
    expect(readConfig({ ...env, WATERMARK_MODEL: "qwen/qwen3.7-plus", WATERMARK_REASONING: "low", WATERMARK_PROVIDERS: "" }).preset).toMatchObject({ reasoning: "low", providers: [] });
    expect(() => readConfig({ ...env, WATERMARK_REASONING: "max" })).toThrow(ConfigError);
    expect(() => readConfig({ ...env, WATERMARK_TEMPERATURE: "3" })).toThrow(ConfigError);
  });
});

describe("the OpenRouter call", () => {
  it("sends the key, the model, the seed and the reasoning setting, and records the usage", async () => {
    const bodies: any[] = [];
    const client = createClient(readConfig({ ...env, WATERMARK_MODEL: "qwen/qwen3.8-27b:free" }), async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return answer("Rewritten."); });
    expect(await client.complete(request)).toEqual({ content: "Rewritten." });
    expect(bodies[0]).toMatchObject({ model: "qwen/qwen3.8-27b:free", seed: 20260817, temperature: 0.7, reasoning: { effort: "low" }, max_tokens: 16_000 });
    expect(bodies[0].provider).toBeUndefined();
    expect(client.calls[0]).toMatchObject({ provider: "Alibaba", costUsd: 0.0001, busyWaits: 0 });

    const paid: any[] = [];
    const paidClient = createClient(readConfig(env), async (url, init) => { paid.push([url, init?.headers, JSON.parse(String(init?.body))]); return answer("Rewritten."); });
    await paidClient.complete(request);
    expect(paid[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(paid[0][1]).toMatchObject({ Authorization: "Bearer sk-or-fictional" });
    expect(paid[0][2]).toMatchObject({ provider: { only: ["alibaba"] }, max_tokens: 4096 });
    expect(paid[0][2].reasoning).toBeUndefined();
  });

  it("waits and asks again when a free model is busy, then gives up with a plain message", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const busy = () => new Response(JSON.stringify({ error: { code: 429, message: "Provider returned error", metadata: { raw: "temporarily rate-limited upstream" } } }), { status: 429 });
    const client = createClient(readConfig({ ...env, WATERMARK_MODEL: "qwen/qwen3.8-27b:free" }), async () => { attempts += 1; return attempts < 3 ? busy() : answer("Rewritten."); }, async ms => { waits.push(ms); });
    expect(await client.complete(request)).toEqual({ content: "Rewritten." });
    expect(waits).toEqual([5_000, 15_000]);
    expect(client.calls[0].busyWaits).toBe(2);

    const paid = createClient(readConfig(env), async () => busy(), async () => {});
    await expect(paid.complete(request)).rejects.toThrow(/busy right now/u);
  });

  it("explains a privacy-setting refusal and a missing credit, and reports a cut-off answer as a token limit", async () => {
    const refused = new Response(JSON.stringify({ error: { message: "0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy. Free model training violation (account settings)", code: 404 } }), { status: 404 });
    await expect(createClient(readConfig(env), async () => refused).complete(request)).rejects.toThrow(/privacy settings/u);
    await expect(createClient(readConfig(env), async () => new Response("{}", { status: 402 })).complete(request)).rejects.toThrow(/no credit/u);
    await expect(createClient(readConfig(env), async () => answer("", "length")).complete(request)).rejects.toBeInstanceOf(CompletionTokenLimitError);
    await expect(createClient(readConfig(env), async () => answer("", "stop")).complete(request)).rejects.toBeInstanceOf(ModelCallError);
  });
});
