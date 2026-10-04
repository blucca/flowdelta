# Four changed nodes, a 22-node release review

## Historical public engineering example

This independent FlowDelta case study reviews a public, MIT-licensed n8n workflow revision by MI. It turns the source changes into a release explanation and a ready-to-run acceptance packet.

**The release:** the author's [Swiftia API migration commit](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/commit/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985) updates a workflow that turns a YouTube video into rendered shorts and prepares uploads. The version pair has **34 nodes, four changed nodes, zero changed connections and 22 potentially affected nodes** under FlowDelta's static graph analysis. Six of the 34 nodes are documentation notes.

[Open this case in FlowDelta](https://blucca.github.io/flowdelta/?demo=swiftia), or load `swiftia-before.json` and `swiftia-after.json` manually. The original [before file](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/5b4f23c641b4392763e1ca100f27d71252df6228/video_to_shorts_Automation.json) and [after file](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985/video_to_shorts_Automation.json) establish the exact historical change. These snapshots establish the migration's historical intent; they do not establish the current external API contract.

## What the consultant needs to explain

| Step | Before | After | Acceptance focus |
|---|---|---|---|
| `generateShorts` | POST body has top-level `youtubeVideoId` and `videoSource` | `youtubeVideoId` moves under `options`; `videoSource` is removed; empty `webhook` is added | Capture the evaluated body and verify nesting, source item and actual provider contract |
| `renderShort` | Body sends `id`, `target` and a computed styling key | Body sends `shortId` and `renderOptions`; the ID now comes from `current_item_ref['data.shorts'].id` | Verify each item's ID, type and styling serialization |
| `iscompleted ?` | `$json.type` equals `done` | `$json.status` equals `COMPLETED` | Verify exact, case-sensitive matching and the polling exit |
| `isError ?` | `$json.type` equals `error` | `$json.status` equals `FAILED` | Verify failure routing and repeat-render behavior |

### Why an unchanged graph still needs release testing

In this export, the **true output of `isError ?` returns to `renderShort`**, issuing another render request. The false output goes to `iscompleted ?`; its false output returns to `Wait1` for another status poll. Therefore, changing two field names and two enum values changes when rendering repeats and when the loop can finish.

The definition contains a rerender/polling cycle. Whether it is appropriately bounded requires checking runtime settings and the intended operating policy. A failed status should not silently create an unbounded series of render requests or billable duplicate jobs. This is an acceptance question raised by the graph, not an observed production failure.

## Acceptance packet

All statuses are **Not run**. Run cases in the target n8n version with controlled response fixtures; record actual outputs, request counts and observations before signing off.

| ID | Input or controlled response | Required observation / acceptance decision | Status |
|---|---|---|---|
| API-1 | `preparingField.videoId = "fixture-video"`, `videoSource = "youtube"` | Capture `generateShorts`' evaluated JSON. New body must place the ID in `options.youtubeVideoId`, retain `functionName: "VideoShorts"`, and include the intended empty `webhook`. Confirm removed `videoSource` is accepted by the provider contract. | Not run |
| API-2 | Two current-item fixtures with `['data.shorts'].id` values `42` and `43`; distinct styling objects | Capture one evaluated `renderShort` body per item. Each `shortId` must come from its corresponding current item, and `renderOptions` must preserve the intended JSON type and fields. Confirm no ID/styling cross-pairing. | Not run |
| API-3 | Styling as an object, a preset string, missing styling, and malformed upstream styling text; an ID containing a string value | Record whether each combination yields valid JSON and the provider-required types. The new template interpolates `styling` directly, whereas the old template used `.toJsonString()`. Resolve unsupported combinations explicitly. | Not run |
| STATUS-1 | `{"status":"COMPLETED"}` | `isError ?` false, then `iscompleted ?` true; proceed to metadata generation without another render/poll cycle. | Not run |
| STATUS-2 | `{"status":"FAILED"}` repeated | `isError ?` true routes to `renderShort`. Record POST count, item identity and the retry/stop policy. Accept only intentional, bounded repeat requests. | Not run |
| STATUS-3 | `{"status":"PENDING"}`, then `{"status":"COMPLETED"}` | First response follows the poll/wait path; second exits it. Record wait duration and number of status requests. `PENDING` is a synthetic nonmatching enum fixture, not a claim about Swiftia's supported states. | Not run |
| STATUS-4 | `{}`, `{"status":null}`, `{"status":"completed"}`, `{"type":"done"}`, `{"type":"error"}` | Record strict validation errors or nonmatching routes. Ensure malformed/legacy responses cannot cause indefinite polling or unintended rerenders; define the timeout/error outcome. | Not run |
| OUTPUT-1 | Two rendered-short fixtures with distinct IDs and controlled upload responses | Confirm output count, metadata-to-file pairing, scheduled publication data and one intended upload per short. | Not run |

**Owner:** Unassigned. **Environment/version:** To be recorded. **Observed results:** None. **Release decision:** Pending execution evidence.

## What FlowDelta contributes

FlowDelta identifies the four changed nodes, the six changed parameter paths, and the 22-node potential impact set; it generates HTTP contract and string-branch acceptance prompts. Expand a change to review old/new values locally. Select only the evidence you intend to include in the exported handoff.

The packet above adds release-specific interpretation of the migration, item pairing and polling/rerender loops. These are the decisions a release handoff needs to preserve for the next maintainer.

## Attribution and fixture preparation

Original workflow: **MI, copyright 2025**, [n8n-youtube-to-shorts-workflow](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow). Full MIT terms are in `swiftia-LICENSE.txt`. FlowDelta adaptations remove pinned execution data and export-instance metadata, and replace webhook/credential identifiers consistently in both versions. Stable node IDs, node parameters, graph structure and all four historical changes are retained. See `README.md` for exact provenance and the second public fixture pair.
