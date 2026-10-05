# Run the release checks

An executable companion to the [Swiftia change review](../public-cases/CASE-STUDY.md): run the original HTTP expressions and render-loop nodes in n8n, capture the requests, and check the terminal outputs.

The lab uses two synthetic videos and two synthetic shorts. A local HTTP server supplies controlled responses. Every retained node and field-level adaptation is listed in the generated `transformations.json`.

## Observed: one payload expression, two failure modes

**Executed on October 5, 2026, using n8n 2.41.7 and Node.js 26.10.0 in a Linux network namespace with loopback only.** [Machine-readable results](observed-results.json).

| Body / styling input | Mock responses | POST / GET | Observed outcome |
|---|---|---:|---|
| Original `generateShorts`, two video IDs | Two job IDs | 2 / 0 | Pass: nested request values and two outputs match |
| Original render body, styling object | Completion | 0 / 0 | Fails before sending: object interpolation produces `[object Object]` |
| Original render body, JSON-encoded styling | Completion | 2 / 2 | Pass: both shorts complete with their own styling |
| Original render body, JSON-encoded styling | Pending → completion | 2 / 4 | Pass: polls again and preserves two final outputs |
| Original render body, JSON-encoded styling | Failed → replacement render | 1 / 1 | Fails on the second `renderShort` execution: the status response supplies no `styling` value |
| Proposed object expression, styling object | Completion | 2 / 2 | Pass |
| Proposed object expression, styling object | Pending → completion | 2 / 4 | Pass |
| Proposed object expression, styling object | Failed → replacement → completion | 4 / 4 | Pass: two attempts per short, two final outputs |

The proposed change replaces `renderShort.parameters.jsonBody` with one object expression. Both fields come from the paired source item, including on the retry path:

```text
={{ {
  shortId: $('current_item_ref').item.json['data.shorts'].id,
  renderOptions: $('current_item_ref').item.json.styling
} }}
```

The comparison holds the remaining render-loop nodes and connections constant. It shows why the acceptance plan includes both a normal two-item run and a failure-recovery run. The mock accepts numeric short IDs and object-valued render options; live provider compatibility is a separate acceptance check.

## Scope

- `generateShorts`: evaluate the changed request body for two distinct source items.
- Render loop: carry short IDs and styling through the original batch loop, HTTP requests, and status branches.
- Response sequences: immediate completion, a pending response followed by completion, and a failed render followed by a replacement render.
- Input comparison: a styling object and a JSON-encoded styling string.
- Proposed change: the same loop with the full-object body expression, tested against all three response sequences.
- Evidence: captured request bodies and counts, n8n execution data, and the final two recorded outputs.

The external boundaries are synthetic Swiftia responses and a local completion recorder. Full-workflow acceptance covers the source form, styling preparation, live provider contracts, Gemini, uploads, and production configuration separately.

The lab caps external fixture requests at 30 and workflow execution at 60 seconds. A production release also needs its agreed retry limit, backoff, and duplicate-job policy.

## Reproduce

Use Node.js 24+ and a dedicated local n8n **2.41.7** installation. The runner creates an isolated n8n data directory inside its output directory.

From the FlowDelta repository:

```sh
mkdir -p temp/n8n-runtime
npm install --prefix temp/n8n-runtime --no-fund --no-audit n8n@2.41.7
```

With npm 12's install-script approvals, enable SQLite's native binding:

```sh
npm --prefix temp/n8n-runtime install-scripts approve sqlite3
npm rebuild --prefix temp/n8n-runtime sqlite3
```

Then run:

```sh
N8N_BINARY="$PWD/temp/n8n-runtime/node_modules/.bin/n8n" \
  node examples/runtime-checks/run-local.mjs --out temp/swiftia-runtime
```

Port `127.0.0.1:8787` is reserved for the mock during the run. For OS-level network isolation, run the same command in a Linux network namespace with loopback enabled. Both n8n and the mock must share that namespace.

Open `summary.json` in the output directory. Each scenario has separate workflow, HTTP, and terminal-output results. The lab records failing scenarios alongside passing scenarios so that request-shape and retry regressions remain visible. The runner also checks the eight-scenario matrix above and exits successfully when that matrix matches. Inspect the accompanying `*.execution.json`, `*.state.json`, and command logs for the underlying observations.

## Source

The retained workflow nodes come from MI's [historical migration](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985/video_to_shorts_Automation.json), via the [documented public fixture](../public-cases/README.md). Copyright 2025 MI, MIT; the builder copies the full license notice into each generated fixture directory.

The scripts and documentation in this directory are also [MIT licensed](LICENSE), copyright 2026 blucca. You can adapt them for your own workflow acceptance checks.

The runner imports each fixture before executing its stable ID, following the [n8n 2.41.7 CLI implementation](https://github.com/n8n-io/n8n/blob/n8n%402.41.7/packages/cli/src/commands/execute.ts).

## A similar deliverable for your release

A reusable fixture pack can include a bounded workflow slice, controlled external responses, expected/actual results, and instructions for the next maintainer. [Describe the behavior your next release must preserve](mailto:belgialucca@gmail.com?subject=Runnable%20n8n%20release%20checks). Implementation scope and pricing are agreed for the actual workflow; the [$149 release-handoff pilot](../../README.md#release-handoff-pilot--149) covers the documented review and acceptance plan.
