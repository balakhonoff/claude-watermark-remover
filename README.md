# Claude Watermark Remover

An open-source MCP server that removes statistical text watermarks, the kind ChatGPT, Claude and Gemini put into
the text they write, by rewriting the wording while keeping the meaning, the structure and the formatting. It runs
on your computer and talks only to [OpenRouter](https://openrouter.ai) with **your own key**, on OpenRouter's
**free models**, so it costs nothing. The price is speed, consistency and availability: on 2026-10-05 the free
model that answered took one to three and a half minutes and replaced 70%, 70% and 87% of the wording on three runs
of one text (this tool's target is 80%), and free models are withdrawn without notice. The server tries several of
them in order.

Works in Claude Desktop, Claude Code, Codex, Cursor and any other MCP client.

> **Prefer not to deal with keys and installs?**
> **[Use the hosted version at painintheagent.com](https://painintheagent.com/tools/ai-text-watermark-remover/)**
> The same rewrite as a connector for claude.ai (it works in the browser and on phones, where a local MCP server
> cannot run) and as a web tool, plus an AI Humanizer and detectors. It answers in 2 to 10 seconds on a paid model
> and needs no OpenRouter account: three free runs, then $10 a month for 100,000 characters.
> Remote MCP URL: `https://painintheagent.com/mcp` · [API & MCP docs](https://painintheagent.com/integrations/)

## What it does

1. Masks the parts that must come back untouched: web links, email addresses, quoted spans, currency amounts and
   percentages.
2. Sends the masked text to the model with one instruction set: rewrite every sentence with a different construction
   and word order; keep every term, name, number and the layout; keep the strength of every statement (*should* is not
   *must*, *17.5%* is not *up to 17.5%*); never translate.
3. Checks the draft locally, with no model: placeholders intact, length within 80–125% of the source, paragraphs,
   lines and list markers unchanged, and at least 80% of five-word sequences replaced. If a check fails, one more draft
   is requested; a result that breaks the layout or leaves 70–140% of the source length is an error, not a result.
4. Restores the masked parts and returns the text with `novelty_percent` (the share of five-word sequences replaced).

No second model checks the meaning. The result is a draft you compare with your source, and the tool tells the
assistant the same thing.

The method is the one measured in [Can rewriting remove AI text watermarks? My SynthID test](https://painintheagent.com/blog/text-watermark-removal-retest/):
a single paraphrase on Qwen3.7 Plus crossed below the reference SynthID Text detector's threshold in 10 of 10 English
reports and kept 100% of the claims checked by the panel.

Small print. That test ran on Qwen3.7 Plus; this program runs the same procedure on OpenRouter's free models,
which were not part of it, with a stricter prompt (terms, layout, statement strength) and sampling at temperature
0.7. The ChatGPT, Claude and Gemini watermark detectors are not public, so
complete removal cannot be verified against them, and OpenAI's textGrain, announced for ChatGPT in October 2026, is
a separate scheme that the test did not cover.

## Install

You need an [OpenRouter](https://openrouter.ai) account and an API key from <https://openrouter.ai/settings/keys>.
A free account is enough: the server only calls free models (see [Free models](#free-models)).

### Claude Desktop

1. Download [claude-watermark-remover-0.2.2.mcpb](https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.2.2.mcpb) (checksums in [releases/SHA256SUMS](https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/SHA256SUMS)).
2. Open the file. Claude Desktop installs it as an extension and asks for your OpenRouter API key (stored by Claude
   Desktop, not by this program) and, optionally, a model.
3. In a chat: *"Remove the watermark from this text: …"*.

### Claude Code

```bash
claude mcp add watermark-remover -e OPENROUTER_API_KEY=sk-or-… -- npx -y --package=https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.2.2.tgz claude-watermark-remover
```

Then in a session: *"Use remove_watermark on the text in draft.md and show me the result."*
The key is written to Claude Code's MCP configuration on your disk (`~/.claude.json` or the project's `.mcp.json`).

### Codex, Cursor and other MCP clients

Install once, then add a stdio server with the command `claude-watermark-remover` and the environment variable
`OPENROUTER_API_KEY`.

```bash
npm install -g https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.2.2.tgz
```

For Codex, put this into `~/.codex/config.toml`.

```toml
[mcp_servers.watermark-remover]
command = "claude-watermark-remover"
env = { OPENROUTER_API_KEY = "sk-or-…" }
```

### Command line

```bash
export OPENROUTER_API_KEY=sk-or-…
npx -y --package=https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.2.2.tgz claude-watermark-remover --text-file draft.txt
```

The package is a single self-contained file (`dist/index.cjs`, Node 22+); the tarball and the `.mcpb` live in
[`releases/`](releases/) with their checksums.

Prints the rewritten text; the figures (share replaced, layout, calls, seconds, cost) go to stderr. `--json` prints
everything as JSON; `--stdin` reads the text from standard input; `--style-file rules.md` passes your writing-style
rules.

## Tools

| Tool | What it does |
|---|---|
| `remove_watermark` | `text` (100–10,000 characters) and optional `style_guidance` (your writing-style rules, applied to wording only). Returns the rewritten text, `novelty_percent`, `target_met`, `layout_kept`, `model`, `skipped_models`, `model_calls`, `seconds`, `cost_usd`. |
| `get_configuration` | The models in their order, the reasoning setting and temperature in use, and the measured presets. No model call. |

Texts of 750 characters (about 120 words) and more give a reliable share; on a short text one kept citation such as
"(Author, 2023)" alone pulls the figure down, so short texts are processed but the number means less.

## Models

By default the server tries these free models in order and returns the first usable rewrite. The result names the
model that answered and, in `skipped_models`, the ones that gave nothing and why.

| Model | Measured |
|---|---|
| `inclusionai/ling-3.0-flash-sante:free` | 2026-10-05, three runs of a 1,074-character text: 61, 158 and 216 s; 87% replaced with one draft, 70% twice with two drafts (target not met); layout kept every time. |
| `nvidia/nemotron-3-super-120b-a12b:free` | 2026-10-03, a 1,316-character list text: 12–25 s, 63–78% replaced, layout kept. Answers only if you allow "free endpoints that may train on inputs" in [OpenRouter's privacy settings](https://openrouter.ai/settings/privacy). Your text may then be used for training. |

`qwen/qwen3.8-27b:free`, the best free model on 2026-10-03 (46 s, 81%), stopped being free two days later. That is
why `WATERMARK_MODEL` takes any model id that ends in `:free`, or several separated by commas, tried in that order.
An unmeasured model gets low reasoning and busy retries, and you check the result yourself. Other settings:
`WATERMARK_REASONING` (`none`, `low`, `medium`, `high`), `WATERMARK_TEMPERATURE` (default 0.7) and
`WATERMARK_PROVIDERS` (comma-separated OpenRouter provider slugs for the first model).

### Free models

OpenRouter's free models are shared and rate-limited. On 2026-10-03 [its limits](https://openrouter.ai/pricing)
were 20 requests a minute, and **50 requests a day** for accounts that never bought credit or **1,000 a day** once
$10 of credit has been bought at any time. A rewrite is one or two requests, so a new account gets 25 to 50 texts
a day. The models are often busy, they think before they answer, and the ones from Nvidia, Poolside and Liquid are
served only to accounts that allow training on inputs. Of the 20 free models listed on 2026-10-05, one rewrote the
test text without that setting; the rest were busy, broke the layout, answered nothing, or are closed to anything
but coding agents. None of this is promised to stay. Full notes: [docs/free-models.md](docs/free-models.md).

## Privacy

Your text goes to OpenRouter and from there to the provider serving the chosen model; nothing is sent anywhere else
and nothing is stored by this program. Free endpoints are not zero-data-retention endpoints; check the provider's
policy on the model's OpenRouter page. The free Nemotron endpoint is explicitly one that may train on inputs.

`OPENROUTER_BASE_URL` points the server at an API gateway instead of OpenRouter; there is no fallback to the real
endpoint when the gateway fails.

## Development

```bash
pnpm install
pnpm test          # unit tests, a fake OpenRouter and the bundled server over stdio
pnpm run build     # dist/index.cjs
pnpm run package   # artifacts/claude-watermark-remover-<version>.mcpb for Claude Desktop
```

`src/core.ts` is the rewrite itself: masking, the prompt, the checks. It is the same code that runs behind
[painintheagent.com](https://painintheagent.com), extracted so that it has no dependency on the service.

## License

MIT. Made by [Kirill Balakhonov](https://painintheagent.com/about/).
