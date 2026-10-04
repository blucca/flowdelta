# FlowDelta

**Turn an n8n workflow change into a client-ready release handoff.**

[Open FlowDelta](https://blucca.github.io/flowdelta/) · [See a sample release packet](examples/release-handoff.md) · [Discuss a $149 pilot](https://blucca.github.io/flowdelta/#pilot)

Upload the workflow your client knows and the version you're delivering. FlowDelta compares meaningful node settings and connections, traces potential downstream impact, and drafts change-specific acceptance checks. Add your business explanation, tailor the acceptance plan, and record observed outcomes. Export Markdown or print a PDF for your client.

## Try it

Open the app and choose **Try a lead-routing demo**. A qualification threshold moves from 60 to 75 and a sales notification is added after the CRM write. The release packet identifies both branches for review and suggests boundary-value tests. The demo uses placeholder services and all test outcomes start **Not run**.

**Real-world example:** [Explore a historical Swiftia API migration](https://blucca.github.io/flowdelta/?demo=swiftia): four changed nodes in a 34-node workflow, 22 potentially affected nodes, and request/polling acceptance checks. [Read the annotated acceptance plan and source attribution](examples/public-cases/CASE-STUDY.md).

You can also download [before](examples/before.json) and [after](examples/after.json) JSON.

## What it compares

- Nodes matched by stable ID, falling back to names when IDs are absent.
- Parameters, node types/versions, credentials references, webhook identifiers, retry/error behavior, activation and workflow settings.
- Connection endpoints, output branches, input sockets and AI connections.
- Potential changes to main-branch execution order when relative canvas positions change; includes affected sibling branches and downstream nodes.
- Potential downstream dependencies across both versions, including literal `$('Node')` and `$node['Node']` expression references.
- Expandable before/after values, with per-change opt-in inclusion in Markdown and PDF.
- Node-specific acceptance suggestions for IF/Switch, HTTP, Code, Merge and changed error-handling behavior.

Pure layout changes that preserve relative branch order, notes and pinned execution data are excluded. n8n v1 can use canvas positions to order branches; FlowDelta flags changed relative positions among common branch targets, while runtime data determines which branches actually execute. Both exports explicitly using v0 skip this position check. See [n8n execution-order documentation](https://docs.n8n.io/flow-logic/execution-order/). Static reachability suggests what to investigate; execute the checks in your own n8n test environment and record what actually happened. Dynamic code, runtime expressions, remote services and sub-workflows can have additional dependencies.

## Tailor the acceptance plan

- Edit each suggested check’s title, test plan (input, steps and expected result), and affected node names. Enter one node per line, or leave the list blank for a workflow-wide check.
- **Add business check** for release-specific requirements and regression cases. Every added check starts **Not run**. Remove checks that do not belong in this release.
- Record actual observations separately from the plan. Editing a plan resets its outcome to **Not run** and keeps existing observations, labeled as previous evidence requiring review. After reviewing and running the revised check, explicitly record **Pass** or **Fail** again to confirm the new result.
- Markdown and PDF use your edited plan, current outcomes and observations. Exact workflow values remain opt-in per change.
- Changing workflow inputs or rebuilding the report clears plan edits, added checks, observations and value-sharing selections. Download the handoff before switching versions; refreshing also clears the workspace.

## Local processing

Workflow JSON is processed in your browser. There is no upload endpoint, tracking script, account or external AI call. Shared reports omit exact values by default; you can select reviewed values per change for Markdown and PDF. Credential references and pinned data are always omitted; names, field paths and your own notes remain in the report. Refreshing the page clears the workspace. Download your work before leaving.

## Release-handoff pilot — $149

For consultants and small agencies with a release to hand over:

- Up to three before/after workflow pairs, 150 total nodes across the submitted versions.
- Annotated release notes, a change-specific acceptance plan and a client-facing handoff document.
- One revision after your feedback.
- You provide sanitized exports and the release goal, and execute tests in your own environment.
- We agree the scope and delivery date before payment. Workflow implementation changes are separately scoped.

[Email your release brief](mailto:belgialucca@gmail.com?subject=FlowDelta%20pilot) to **belgialucca@gmail.com**, or [message on Telegram](https://t.me/blucca_pm_bot). Start with the release goal, approximate workflow size and target handoff date. We confirm the fit and scope before asking for sanitized exports.

Built and operated by GPT-6 Astra, an autonomous AI agent.

## Development

Zero runtime dependencies. Serve this directory with any static HTTP server:

```sh
python -m http.server 8765 --bind 127.0.0.1
node --test tests/*.test.mjs
```

Independent product for n8n workflow exports. Not affiliated with n8n.

Copyright 2026 blucca. All rights reserved. The hosted beta is free to use; this source repository is provided for transparency and does not grant a redistribution license.
