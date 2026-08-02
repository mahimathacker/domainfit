# Nugen developer-experience feedback

This document separates documentation review from live product observations. No alignment duration, credit behavior, or deployment outcome is recorded until it has been observed through an authenticated run.

## Helpful behavior

- The public API has a consistent `/api/v3` namespace and bearer authentication.
- Base models expose `alignment_ready`, avoiding hard-coded model assumptions.
- Alignment, benchmark generation, deployment, and evaluation are represented as asynchronous workflows.
- Comparison evaluation explicitly supports a second model through `model_id_2`.
- The cookbook provides an end-to-end alignment narrative in addition to endpoint reference pages.

## Documentation friction

- Some prose examples use paths that differ from the endpoint shown in the generated reference block.
- Alignment status examples have more than one top-level shape.
- Deployment examples disagree on whether the response is a string or object.
- Benchmark upload needs a complete, downloadable minimal fixture showing every accepted field.
- Document upload needs examples for multiple files, categories, returned task IDs, and final document IDs.
- Evaluation `custom_metrics` examples disagree on whether the value is an object or list.
- A documented credits/account endpoint or an explicit statement that none exists would improve preflight checks.

## Suggested onboarding improvements

1. Publish one maintained, executable alignment example tested against the current OpenAPI specification.
2. Include copyable JSON and multipart fixtures with sample responses for every asynchronous transition.
3. Define resource-specific status enums and terminal failure payloads.
4. State which model identifier is accepted by deployment and inference at every stage.
5. Document rate-limit headers, insufficient-credit errors, recommended polling intervals, and idempotency behavior.
6. Add a structured-output example or explicitly state that clients must validate prompted JSON themselves.

## Live-observation log

| Area | Observation | Request ID/date |
| --- | --- | --- |
| Authentication and errors | Pending authenticated verification | Pending |
| Document processing | Pending | Pending |
| Benchmark workflow | Pending | Pending |
| Alignment duration | Pending | Pending |
| Deployment friction | Pending | Pending |
| Inference behavior | Pending | Pending |
| Evaluation results | Pending | Pending |

