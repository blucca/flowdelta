# Public workflow-history fixtures

These are historical public engineering examples, independently analyzed by FlowDelta. They are suitable for static comparison; no execution results or current provider compatibility are implied.

## Swiftia API migration

- Files: `swiftia-before.json`, `swiftia-after.json`.
- Author: MI. Copyright 2025 MI. License: MIT; full notice in `swiftia-LICENSE.txt`.
- [Original before](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/5b4f23c641b4392763e1ca100f27d71252df6228/video_to_shorts_Automation.json).
- [Original after](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985/video_to_shorts_Automation.json).
- [Change commit](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/commit/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985); before is its first parent.
- [Pinned license](https://github.com/mismai-li/n8n-youtube-to-shorts-workflow/blob/7cd32c2a6ccbb2ca6edf4bded2534e916fd08985/LICENSE).
- 34 nodes each, four changed nodes, no wire changes, 22 potential impacts.
- [Case study and unexecuted acceptance packet](CASE-STUDY.md).

## DailyJobMatch credential handoff

- Files: `daily-job-match-before.json`, `daily-job-match-after.json`.
- Author: Chunxu Han. Copyright 2025 Chunxu Han. License: MIT; full notice in `daily-job-match-LICENSE.txt`.
- [Original before](https://github.com/chunxubioinfor/DailyJobMatch/blob/707092ba7580e8a5508572de8bdc14c7cc022a80/workflow/Daily_Job_Match.json).
- [Original after](https://github.com/chunxubioinfor/DailyJobMatch/blob/afcd524a7cab6c9f650760f270d85655f11d32c3/workflow/Daily_Job_Match_updated.json).
- [Change commit](https://github.com/chunxubioinfor/DailyJobMatch/commit/afcd524a7cab6c9f650760f270d85655f11d32c3); the author adds a file named “updated” rather than modifying the old path. Before is the original workflow at the commit's first parent. All 30 stable node IDs match, making this a clear two-version pair despite the path change.
- [Pinned license](https://github.com/chunxubioinfor/DailyJobMatch/blob/afcd524a7cab6c9f650760f270d85655f11d32c3/LICENSE).
- 30 nodes each; credentials removed from `Send a message`, `RetrieveCV`, `OpenAI Chat Model1`; no parameter/wire changes; 17 potential impacts.
- Handoff focus: bind the three missing credentials in the deployment environment, verify sender identity and CV access, and check the intended account for the unchanged `OpenAI Chat Model`, which still has a credential selection. Run normal and denied-access fixtures; all runtime tests remain **Not run**.

## Adaptations

Both pairs retain the full node arrays, stable IDs, parameter contents, graph structure, activation flag and settings. We remove `pinData`, top-level workflow/version/instance IDs, tags and metadata. Credential ID/name and webhook ID values are consistently replaced with example identifiers across each pair; matching values inside parameters are replaced too. These transformations preserve the reported semantic deltas. Credentials are example references only; original public API-key placeholders remain placeholders.

The source JSON and bundled license notices carry their upstream MIT grants. The FlowDelta application itself has separate copyright terms.
