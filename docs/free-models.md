# Free models on OpenRouter, measured 2026-10-03

All calls used this program's production prompt on a 1,316-character English list text (a heading, numbered items,
bold labels). "Replaced" is the share of five-word sequences of the result that do not appear in the source; the
figures here come from a quick script, the tool's own measure is similar. Every call cost $0.

## Rules for `:free` models

- 20 requests a minute across all free models.
- 50 requests a day if the account never bought credit; 1,000 a day once $10 of credit has been bought at any time
  (lifetime purchases, not the current balance).
- Two privacy toggles in the account settings: whether providers that may train on inputs are allowed, separately
  for paid and for free models. Some free endpoints exist only behind the free-model toggle.

## Results

| Model | Reasoning off | Reasoning low |
|---|---|---|
| `qwen/qwen3.8-27b:free` (ModelRun) | 2–7 s, 29–51% replaced | 46 s, 81% replaced, layout kept |
| `nvidia/nemotron-3-super-120b-a12b:free` (needs the training toggle) | 1 s, returned the source unchanged | 12 s, 78%; a repeat 25 s, 63%; layout kept |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 7 s, source unchanged | 299 s, 80% — too slow |
| `nvidia/nemotron-3.5-lightning:free` | 155 s, source unchanged | — |
| `inclusionai/ling-3.0-flash-sante:free` | returned the source almost unchanged (2%) | spent 10–12k tokens thinking, empty answer |
| `apodex/apodex-1.1-mini:free`, `cohere/north-mini-code:free` | 10% and 27%; Cohere broke the line structure | — |
| `google/gemma-4-31b-it:free`, `gemma-4-26b-a4b-it:free` (Google AI Studio) | 429 "temporarily rate-limited upstream" on every attempt | — |
| `poolside/laguna-s-2.1:free`, `laguna-xs-2.1:free` | 429 on every attempt | — |
| `thinkingmachines/inkling:free` | 403: only for agentic harnesses | — |
| `stealth/space-bunny-alpha` | reasoning is mandatory | 3 s, 78% — stealth models are temporary |
| `openrouter/free` (the router) | picks a model itself: once a reasoning model that answered nothing, once Ling that copied the source | — |

With the default reasoning setting (neither off nor low) the reasoning models spent their whole output budget
thinking and returned nothing, so this program sets `low` for free models and raises the output budget.

## What this means

- Free and usable: `qwen/qwen3.8-27b:free` (no privacy toggle needed, slow) and `nvidia/nemotron-3-super-120b-a12b:free`
  (faster, needs the toggle). Both are a lottery for availability.
- Almost free: `qwen/qwen3.7-plus` at about $0.001 per 1,000 characters, 2–10 s, 85–100% replaced — $5 of OpenRouter
  credit lasts years, and buying it also raises the free-model limit to 1,000 requests a day.
- No keys at all, and in claude.ai on the web and phones: the hosted version at https://painintheagent.com.
