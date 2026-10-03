# Claude Watermark Remover

An open-source MCP server that removes the statistical text watermark (SynthID-style, the kind Claude and Gemini
put into their output) by rewriting the wording while keeping the meaning, the structure and the formatting. It runs on
your computer and talks only to [OpenRouter](https://openrouter.ai) with **your own key** — including OpenRouter's
free models, so the whole thing can cost nothing.

Works in Claude Desktop, Claude Code, Codex, Cursor and any other MCP client.

> **Prefer not to deal with keys and installs?**
> **[Hosted version at painintheagent.com →](https://painintheagent.com/tools/ai-text-watermark-remover/)**
> The same rewrite as a one-click connector for claude.ai (works in the browser and on phones, where local MCP servers
> cannot run), plus the AI Humanizer and detectors. $10 a month, no OpenRouter account needed.
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

No second model checks the meaning. The result is a draft you compare with your source — that is what the tool
tells the assistant, too.

The method is the one measured in [Can rewriting remove AI text watermarks? My SynthID test](https://painintheagent.com/blog/text-watermark-removal-retest/):
a single paraphrase on Qwen3.7 Plus crossed below the reference detector's threshold in 10 of 10 English reports
and kept 100% of the claims checked by the panel. This program uses a stricter prompt (terms, layout, statement
strength) and sampling at temperature 0.7, which were not part of that test. Private production keys of Claude and
Gemini are not published, so complete removal cannot be verified against them.

## Install

You need an [OpenRouter](https://openrouter.ai) account and an API key from <https://openrouter.ai/settings/keys>.
Set a credit limit on the key. With the default paid model a 1,000-character text costs about $0.001; with a free
model it costs nothing (see [Free models](#free-models)).

### Claude Desktop

1. Download [claude-watermark-remover-0.1.0.mcpb](https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.1.0.mcpb) (checksums in [releases/SHA256SUMS](https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/SHA256SUMS)).
2. Open the file. Claude Desktop installs it as an extension and asks for your OpenRouter API key (stored by Claude
   Desktop, not by this program) and, optionally, a model.
3. In a chat: *"Remove the watermark from this text: …"*.

### Claude Code

```bash
claude mcp add watermark-remover -e OPENROUTER_API_KEY=sk-or-… -- npx -y --package=https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.1.0.tgz claude-watermark-remover
```

Then in a session: *"Use remove_watermark on the text in draft.md and show me the result."*
The key is written to Claude Code's MCP configuration on your disk (`~/.claude.json` or the project's `.mcp.json`),
so keep a credit limit on it.

### Codex, Cursor and other MCP clients

Install once, then add a stdio server with the command `claude-watermark-remover` and the environment variable
`OPENROUTER_API_KEY`:

```bash
npm install -g https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.1.0.tgz
```

For Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.watermark-remover]
command = "claude-watermark-remover"
env = { OPENROUTER_API_KEY = "sk-or-…" }
```

### Command line

```bash
export OPENROUTER_API_KEY=sk-or-…
npx -y --package=https://github.com/balakhonoff/claude-watermark-remover/raw/main/releases/claude-watermark-remover-0.1.0.tgz claude-watermark-remover --text-file draft.txt
```

The package is a single self-contained file (`dist/index.cjs`, Node 22+); the tarball and the `.mcpb` live in
[`releases/`](releases/) with their checksums.

Prints the rewritten text; the figures (share replaced, layout, calls, seconds, cost) go to stderr. `--json` prints
everything as JSON; `--stdin` reads the text from standard input; `--style-file rules.md` passes your writing-style
rules.

## Tools

| Tool | What it does |
|---|---|
| `remove_watermark` | `text` (100–10,000 characters) and optional `style_guidance` (your writing-style rules, applied to wording only) → the rewritten text, `novelty_percent`, `target_met`, `layout_kept`, `model`, `model_calls`, `seconds`, `cost_usd`. |
| `get_configuration` | The model, reasoning setting and temperature in use, and the measured presets. No model call. |

Texts of 750 characters (about 120 words) and more give a reliable share; on a short text one kept citation such as
"(Author, 2023)" alone pulls the figure down, so short texts are processed but the number means less.

## Models

| `WATERMARK_MODEL` | Cost | Measured on a 1,316-character list text (2026-10-03) |
|---|---|---|
| `qwen/qwen3.7-plus` (default) | ≈ $0.001 per 1,000 characters | 2–10 s, 85–100% replaced, layout kept. The model of the published test. |
| `qwen/qwen3.8-27b:free` | free | 46 s, 81% replaced, layout kept. Needs low reasoning (set automatically). Often answers 429 "busy": the server waits and asks again up to three times. |
| `nvidia/nemotron-3-super-120b-a12b:free` | free | 12–25 s, 63–78% replaced, layout kept. Available only if you allow "free endpoints that may train on inputs" in [OpenRouter's privacy settings](https://openrouter.ai/settings/privacy) — your text may then be used for training. |

Any other OpenRouter model id works; a `:free` model gets low reasoning and busy retries by default, a paid one no
reasoning. Override with `WATERMARK_REASONING` (`none`, `low`, `medium`, `high`), `WATERMARK_TEMPERATURE` (default
0.7) and `WATERMARK_PROVIDERS` (comma-separated OpenRouter provider slugs; the default pins `qwen/qwen3.7-plus` to
`alibaba`).

### Free models

OpenRouter's free models are shared and rate-limited: 20 requests a minute, and **50 requests a day** for accounts
that never bought credit or **1,000 a day** once $10 of credit has been bought at any time. A rewrite is one or two
requests. They are often busy, they think before they answer (hence 12–46 seconds), and the ones from Nvidia and
Poolside are served only to accounts that allow training on inputs. Of the 22 free models listed on 2026-10-03, two
rewrote our test text usably; the rest returned it unchanged, ran out of tokens while reasoning, or were busy.
Full notes: [docs/free-models.md](docs/free-models.md).

## Privacy

Your text goes to OpenRouter and from there to the provider serving the chosen model; nothing is sent anywhere else
and nothing is stored by this program. With the default model and the `alibaba` provider the endpoint is not a
zero-data-retention endpoint; check the provider's policy on the model's OpenRouter page. The free Nemotron endpoint
is explicitly one that may train on inputs.

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
