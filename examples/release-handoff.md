# Workflow release handoff

**Client / project:** Demo · inbound lead routing
**Release goal:** Focus sales follow-up on higher-scoring leads
**Delivery owner:** Not specified

**Previous version:** Inbound leads · current
**New version:** Inbound leads · focused sales alerts

## Summary

1 nodes added · 0 removed · 1 changed · 1 connections added · 0 removed · 4 potentially impacted nodes

## Changes

### Qualify lead — changed

Changed fields: parameters\["conditions"\]\["conditions"\]\[0\]\["rightValue"\]
Client-facing explanation: Raise the qualification threshold from 60 to 75 so only higher-scoring leads reach the sales notification path.

### Notify sales — added

Changed fields: N/A
Client-facing explanation: Notify the sales channel when a lead qualifies. The existing CRM write still runs before the notification.

## Connection changes

- added: Create CRM lead → Notify sales (main, output 0, input 0)

## Potential downstream impact

Static graph reachability; confirm conditional paths and runtime behavior with test data.

- **Qualify lead:** Node changed
- **Notify sales:** Node added; Incoming connection added
- **Create CRM lead:** Downstream of a changed node or connection
- **Keep for nurture:** Downstream of a changed node or connection

## Acceptance plan

Tests are executed by the delivery team in their n8n environment. The comparison tool does not run tests.

### 1. Test old and new decision boundaries
**Status:** NOT RUN
For each changed condition, use inputs just below, equal to and just above both the old and new threshold where ordered comparisons apply. Also test missing/null values and type coercion. Confirm the selected output branch, fallback behavior and downstream item counts. For this demo: compare scores 59, 60, 61, 74, 75 and 76. In the new version, scores below 75 should follow nurture; 75 and above should create a CRM lead.
**Affected nodes:** Qualify lead
**Observed result / evidence:** No observations recorded.

### 2. Exercise new node with representative input
**Status:** NOT RUN
With a configured test Slack channel, run a qualifying lead and confirm one sales alert arrives after the CRM write succeeds. Verify the message contains no unintended customer data.
**Affected nodes:** Notify sales
**Observed result / evidence:** No observations recorded.

### 3. Verify modified parameter behavior
**Status:** NOT RUN
Use identical representative and empty/malformed input fixtures with both configurations. Compare output shape, item count and side effects for the reported parameter paths; inspect exact values locally.
**Affected nodes:** Notify sales
**Observed result / evidence:** No observations recorded.

### 4. Exercise changed incoming connections
**Status:** NOT RUN
Send a representative item through each changed output branch and target input socket. Confirm which items arrive, output counts and error routes; inspect AI dependency sockets where applicable.
**Affected nodes:** Notify sales
**Observed result / evidence:** No observations recorded.

### 5. Inspect potentially affected outputs
**Status:** NOT RUN
Run representative fixtures in a suitable test environment and inspect downstream results. This report does not execute or validate the workflow.
**Affected nodes:** Qualify lead, Notify sales, Create CRM lead, Keep for nurture
**Observed result / evidence:** No observations recorded.

## Analysis limitations

- Potential impact is a static estimate across both workflow versions, not execution validation. Scope: node parameters, type/version, credentials, execution flags, connections, workflow settings and activation; other metadata is ignored.
- Synthetic demo only. CRM URL and Slack channel are placeholders; configure services and credentials before attempting execution.

## Sharing notes

This report excludes raw workflow parameters, credential references and pinned data. Node names, field names, version names, explanations and notes may still contain business information. Review before sharing.

Generated locally with FlowDelta.