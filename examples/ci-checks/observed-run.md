# Recorded GitHub Actions check summaries

[Actual run](https://github.com/blucca/flowdelta/actions/runs/37447564414) · [Input and report JSON](observed-results.json) · [Run it yourself](README.md)

Consumer commit: `0c8717d53792896394fe16d8737da80bcf932022`. Action: `v0.1.2` / `1a9439e`. These summaries are rendered from the downloaded GitHub Actions artifact.

**The demonstration succeeded:** the repaired workflow passed all 9 checks with 7 HTTP requests, and the original expression produced the expected exit 1 before any HTTP request. Both executed in n8n 2.41.7 with loopback-only networking. All inputs and HTTP responses are synthetic.

## Repaired workflow

## n8n-check: PASSED

**One failed render, one pending render: preserve both short identities** · 9/9 checks · 7 HTTP requests

n8n 2.41.7 · runner 0.1.2 · loopback-only

| Result | Check |
| --- | --- |
| ✅ | n8n execution succeeds |
| ✅ | Record completed short: output 0 |
| ✅ | mock: all requests match routes |
| ✅ | mock: request limits and server |
| ✅ | renderShort: POST /api/render/ request count |
| ✅ | renderShort: POST /api/render/ request bodies |
| ✅ | getRender: GET /api/render/render-42-1 request count |
| ✅ | getRender: GET /api/render/render-42-2 request count |
| ✅ | getRender: GET /api/render/render-43-1 request count |

### Request trace

| # | Node | Method | Path | Status |
| --- | --- | --- | --- | --- |
| 1 | renderShort | POST | /api/render/ | 200 |
| 2 | getRender | GET | /api/render/render-42-1 | 200 |
| 3 | renderShort | POST | /api/render/ | 200 |
| 4 | getRender | GET | /api/render/render-42-2 | 200 |
| 5 | renderShort | POST | /api/render/ | 200 |
| 6 | getRender | GET | /api/render/render-43-1 | 200 |
| 7 | getRender | GET | /api/render/render-43-1 | 200 |

Reports: `report.json` and `junit.xml` in the configured output directory. Upload these files in an `if: always()` step to retain the results.

## Original expression — expected regression

## n8n-check: FAILED

**One failed render, one pending render: preserve both short identities** · 2/9 checks · 0 HTTP requests

n8n 2.41.7 · runner 0.1.2 · loopback-only

| Result | Check |
| --- | --- |
| ❌ | n8n execution succeeds |
| ❌ | Record completed short: output 0 |
| ✅ | mock: all requests match routes |
| ✅ | mock: request limits and server |
| ❌ | renderShort: POST /api/render/ request count |
| ❌ | renderShort: POST /api/render/ request bodies |
| ❌ | getRender: GET /api/render/render-42-1 request count |
| ❌ | getRender: GET /api/render/render-42-2 request count |
| ❌ | getRender: GET /api/render/render-43-1 request count |

<details><summary>n8n execution succeeds</summary>

Expected:<pre></pre>
Actual:<pre>{
  &quot;cliExitCode&quot;: 1,
  &quot;lastNode&quot;: &quot;renderShort&quot;,
  &quot;message&quot;: &quot;The value in the \&quot;JSON Body\&quot; field is not valid JSON&quot;,
  &quot;description&quot;: &quot;Unexpected token &#39;o&#39;, ...\&quot;ptions\&quot;: [object Obj\&quot;... is not valid JSON&quot;,
  &quot;executionFound&quot;: true
}</pre>
</details>

<details><summary>Record completed short: output 0</summary>

Expected:<pre>[
  {
    &quot;shortId&quot;: 42,
    &quot;renderId&quot;: &quot;render-42-2&quot;,
    &quot;status&quot;: &quot;COMPLETED&quot;
  },
  {
    &quot;shortId&quot;: 43,
    &quot;renderId&quot;: &quot;render-43-1&quot;,
    &quot;status&quot;: &quot;COMPLETED&quot;
  }
]</pre>
Actual:<pre>[]</pre>
</details>

<details><summary>renderShort: POST /api/render/ request count</summary>

Expected:<pre>3</pre>
Actual:<pre>0</pre>
</details>

<details><summary>renderShort: POST /api/render/ request bodies</summary>

Expected:<pre>[
  {
    &quot;shortId&quot;: 42,
    &quot;renderOptions&quot;: {
      &quot;color&quot;: &quot;#112233&quot;,
      &quot;fontSize&quot;: 31
    }
  },
  {
    &quot;shortId&quot;: 42,
    &quot;renderOptions&quot;: {
      &quot;color&quot;: &quot;#112233&quot;,
      &quot;fontSize&quot;: 31
    }
  },
  {
    &quot;shortId&quot;: 43,
    &quot;renderOptions&quot;: {
      &quot;color&quot;: &quot;#aabbcc&quot;,
      &quot;fontSize&quot;: 47
    }
  }
]</pre>
Actual:<pre>[]</pre>
</details>

<details><summary>getRender: GET /api/render/render-42-1 request count</summary>

Expected:<pre>1</pre>
Actual:<pre>0</pre>
</details>

<details><summary>getRender: GET /api/render/render-42-2 request count</summary>

Expected:<pre>1</pre>
Actual:<pre>0</pre>
</details>

<details><summary>getRender: GET /api/render/render-43-1 request count</summary>

Expected:<pre>2</pre>
Actual:<pre>0</pre>
</details>

Reports: `report.json` and `junit.xml` in the configured output directory. Upload these files in an `if: always()` step to retain the results.
