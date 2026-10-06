# A real n8n regression check in GitHub Actions

**Two shorts enter a render loop. One render fails and gets replaced; the other stays pending before completing. Do both shorts keep their own styling and identity?**

This is a consumer of the [n8n-check GitHub Action](https://github.com/blucca/n8n-check#add-a-check-to-github-actions). The workflow export and fixture contract live in this repository; GitHub builds the pinned n8n runtime and executes the real nodes. JSON/JUnit reports and readable check summaries accompany each run.

[View the workflow runs](https://github.com/blucca/flowdelta/actions/workflows/n8n-regression.yml) · [Copy the CI file](../../.github/workflows/n8n-regression.yml) · [Read the fixture contract](render.case.json)

## Try it entirely in GitHub

1. Fork this repository.
2. Open **Actions**, enable workflows for your fork if prompted, and select **n8n render-loop regression example**.
3. Choose **Run workflow**. Open the resulting run and its **render-loop** job for the check summaries. The **render-loop-json-and-junit** artifact contains both sets of reports.

The demonstration runs two versions against the same case:

| Workflow | Expected result | Requests |
|---|---|---|
| `render-fixed.json` | 9 checks pass; both short IDs and replacement render IDs preserved | 3 POST + 4 GET |
| `render-broken.json` | Exit 1; object interpolation fails before the HTTP request | 0 |

The second step has `continue-on-error: true` because this demonstration **expects the original expression to fail**. A final step verifies the real outcomes and exit codes. For your release gate, keep the passing-workflow action step and artifact upload; remove the intentional failure and demonstration-verification steps. Set the job as a required check in your repository rules to gate merges.

## The fixture story

- Short **42** → POST `render-42-1` → GET `FAILED` → POST `render-42-2` → GET `COMPLETED`.
- Short **43** → POST `render-43-1` → GET `PENDING` → GET `COMPLETED`.
- Both POST attempts for 42 must contain its original object-valued styling. The POST for 43 must contain 43's styling.
- Terminal records must be exactly `42 / render-42-2 / COMPLETED` and `43 / render-43-1 / COMPLETED`, in that order.

`render.case.json` supplies two input items, ordered local HTTP responses, exact request counts/bodies, and exact terminal outputs. The n8n workflow retains its Loop, Wait, If and HTTP Request nodes and paired-item expression evaluation. External responses are synthetic.

## One expression changes

```diff
- ={ "shortId": {{ $('current_item_ref').item.json['data.shorts'].id }}, "renderOptions": {{ $json.styling }} }
+ ={{ { shortId: $('current_item_ref').item.json['data.shorts'].id, renderOptions: $('current_item_ref').item.json.styling } }}
```

See the JSON files for the original expression's exact whitespace. The full-object expression preserves nested values and uses the paired source item on the retry path.

## Origin and execution boundary

These workflow slices are generated from the MIT-licensed [public Swiftia example](../public-cases/README.md) by [build-fixtures.mjs](../runtime-checks/build-fixtures.mjs): `--styling object` for the original and `--repair-body` for the proposed expression. Both files then receive the same fixture name and ID. Copyright (c) 2025 MI; the [upstream MIT notice](../public-cases/swiftia-LICENSE.txt) applies to derived workflow portions. The new case, consumer CI, and documentation are MIT under [Blucca's runtime-example license](../runtime-checks/LICENSE).

The fixture starts before the item loop. Wait is shortened to 0.1 seconds; a Set node records terminal outputs; external branches are omitted. The case redirects two HTTP Request nodes to the local mock. The action mounts the two input JSON files read-only, creates an isolated n8n database under the output directory, and runs with loopback-only networking. The test scope covers this JSON/HTTP render slice. Source forms, production credentials, Swiftia, uploads, Gemini and live provider contracts have their own acceptance checks.

Need this fitted to your workflow? [The $650 regression implementation pilot](https://blucca.github.io/n8n-release-checks/) covers one slice, up to two mocked HTTP integrations and eight agreed scenarios.
