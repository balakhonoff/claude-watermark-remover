import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** A stand-in for OpenRouter: rewrites by spelling every word backwards, which replaces every five-word sequence. */
const source = "The committee reviewed the proposal on https://example.org/plan and concluded that the timeline was realistic. " +
  "It will cost $34 per unit, about 24% less than the previous supplier asked for last year.\n\n" +
  "A second meeting is planned once the supplier confirms the delivery dates for the first batch.";
const reworded = (text: string) => text.replace(/\p{L}{2,}/gu, word => Array.from(word).reverse().join(""));

let service: Server;
let baseUrl = "";
const requests: any[] = [];
beforeAll(async () => {
  service = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ authorization: req.headers.authorization, url: req.url, body });
    const masked = JSON.parse(body.messages[1].content).sourceText as string;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: body.model, provider: "Fixture", choices: [{ finish_reason: "stop", message: { content: reworded(masked) } }], usage: { prompt_tokens: 100, completion_tokens: 80, cost: 0 } }));
  });
  service.listen(0, "127.0.0.1");
  await once(service, "listening");
  const address = service.address();
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/api/v1`;
});
afterAll(() => { service.close(); });

describe("the bundled server over stdio", () => {
  it("lists the tools, rewrites through the configured base URL with the key from the environment, and keeps protected spans", async () => {
    const client = new Client({ name: "fixture", version: "0.0.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: ["dist/index.cjs"],
      env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), OPENROUTER_API_KEY: "sk-or-fixture", OPENROUTER_BASE_URL: baseUrl, WATERMARK_MODEL: "fixture/model:free" } });
    await client.connect(transport);
    try {
      const tools = (await client.listTools()).tools.map(tool => tool.name).sort();
      expect(tools).toEqual(["get_configuration", "remove_watermark"]);
      const configuration = (await client.callTool({ name: "get_configuration", arguments: {} })).structuredContent as Record<string, unknown>;
      expect(configuration).toMatchObject({ model: "fixture/model:free", base_url: baseUrl, temperature: 0.7 });
      const result = await client.callTool({ name: "remove_watermark", arguments: { text: source } });
      expect(result.isError).not.toBe(true);
      const payload = result.structuredContent as Record<string, unknown>;
      expect(payload).toMatchObject({ target_met: true, layout_kept: true, model_calls: 1, model: "fixture/model:free", provider: "Fixture", cost_usd: 0 });
      expect(payload.novelty_percent as number).toBeGreaterThanOrEqual(80);
      expect(String(payload.text)).toContain("https://example.org/plan");
      expect(String(payload.text)).toContain("$34");
      expect(String(payload.text)).toContain("24%");
      expect(requests[0].authorization).toBe("Bearer sk-or-fixture");
      expect(requests[0].url).toBe("/api/v1/chat/completions");
      // The masked text, not the links and amounts, went to the model.
      expect(requests[0].body.messages[1].content).not.toContain("example.org");
      const short = await client.callTool({ name: "remove_watermark", arguments: { text: "Too short." } });
      expect(short.isError).toBe(true);
    } finally { await client.close(); }
  });

  it("reports a missing key as a tool error instead of crashing", async () => {
    const client = new Client({ name: "fixture", version: "0.0.0" });
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => key !== "OPENROUTER_API_KEY" && value !== undefined)) as Record<string, string>;
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.cjs"], env }));
    try {
      const result = await client.callTool({ name: "remove_watermark", arguments: { text: source } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("OPENROUTER_API_KEY");
    } finally { await client.close(); }
  });
});
