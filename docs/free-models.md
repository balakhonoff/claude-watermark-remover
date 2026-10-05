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
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 7 s, source unchanged | 299 s, 80%: too slow |
| `nvidia/nemotron-3.5-lightning:free` | 155 s, source unchanged | not tried |
| `inclusionai/ling-3.0-flash-sante:free` | returned the source almost unchanged (2%) | spent 10–12k tokens thinking, empty answer |
| `apodex/apodex-1.1-mini:free`, `cohere/north-mini-code:free` | 10% and 27%; Cohere broke the line structure | not tried |
| `google/gemma-4-31b-it:free`, `gemma-4-26b-a4b-it:free` (Google AI Studio) | 429 "temporarily rate-limited upstream" on every attempt | not tried |
| `poolside/laguna-s-2.1:free`, `laguna-xs-2.1:free` | 429 on every attempt | not tried |
| `thinkingmachines/inkling:free` | 403: only for agentic harnesses | not tried |
| `stealth/space-bunny-alpha` | reasoning is mandatory | 3 s, 78%; stealth models are temporary |
| `openrouter/free` (the router) | picks a model itself: once a reasoning model that answered nothing, once Ling that copied the source | not tried |

With the default reasoning setting (neither off nor low) the reasoning models spent their whole output budget
thinking and returned nothing, so this program sets `low` for free models and raises the output budget.

## 2026-10-05, two days later

The free list had 20 models and `qwen/qwen3.8-27b:free` was no longer on it ("This model is unavailable for free").
The table shows the same prompt through this program on a 1,074-character prose text of three paragraphs, with
the "may train on inputs" setting off.

| Model | Result |
|---|---|
| `inclusionai/ling-3.0-flash-sante:free`, reasoning low | three runs: 158 s and 216 s with two drafts and 70% replaced; 61 s with one draft and 87%; layout kept every time |
| the same, reasoning off | ran out of output tokens |
| the same, reasoning medium | empty answer |
| `google/gemma-4-31b-it:free`, `gemma-4-26b-a4b-it:free` | 429 "busy" after three waits |
| `apodex/apodex-1.1-mini:free` | broke the paragraph layout twice: an error, no text |
| `dots-studio/dots-3-note-preview:free`, `cohere/north-mini-code:free` | no answer within 4 minutes |
| `nvidia/nemotron-3-super-120b-a12b:free`, `liquid/lfm-2.5-2.6b:free`, `poolside/laguna-s-2.1:free` | closed without the training setting; not measured that day |
| `thinkingmachines/inkling-small:free` | 403: only for agentic harnesses |

## What this means

- On 2026-10-05, free and working without the training setting: `inclusionai/ling-3.0-flash-sante:free`, one to
  three and a half minutes, 70% replaced on two runs and 87% on the third (the target is 80%). With the setting on, `nvidia/nemotron-3-super-120b-a12b:free`
  was faster on 2026-10-03. Both are a lottery for availability, and the best free model of October 3 is gone.
- This program accepts any model id that ends in `:free`, because this list will be out of date soon.
- No keys, an answer in 2 to 10 seconds, and claude.ai on the web and phones: the hosted version at
  https://painintheagent.com ($10 a month for 100,000 characters).
