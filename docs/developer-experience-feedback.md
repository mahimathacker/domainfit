# Nugen Developer Experience Feedback

This document records what we learned while running the DomainFit workflow with the live Nugen API and dashboard from 2–4 August 2026. It separates platform behavior from model quality. An API request can succeed even when the resulting model is not reliable enough for a real application.

## Documentation and workflow guidance

The current documentation is useful as an API reference. It lists endpoints, request fields, response fields, and status values. However, it does not yet provide enough guidance for someone who is new to model alignment or trying to build a complete application.

More guidance is needed on:

- What “alignment-ready” means and how it differs from being available for normal inference.
- How Nugen uses uploaded documents to create synthetic training data.
- How developers should format, organize, clean, and review source documents.
- How training documents differ from benchmarks and held-out test cases.
- How to choose a base model with enough capability for a specific use case.
- Which inference features each model supports, including chat, JSON output, reasoning, and tool calling.
- Whether a requested tool call is guaranteed or is only a suggestion to the model.
- How to measure whether an alignment improved or harmed the base model.
- How to interpret model states such as `READY`, `EVALUATED`, and `DEPLOYED` alongside job states such as `PROCESSING`, `COMPLETED`, and `FAILED`.
- What to do when alignment and deployment succeed but the aligned model produces worse answers.
- When to use alignment, prompting, retrieval, tools, or normal application code.
- How to move from a successful API experiment to a tested production application.

Without this guidance, developers can complete every API step but still be unsure whether they prepared the right data, selected the right model, created an independent benchmark, or produced a useful alignment.

### Suggested improvements

- Add a beginner-friendly guide that explains the complete workflow and the purpose of every step.
- Include one decision guide for choosing between prompting, alignment, retrieval, tools, and application code.
- Publish examples of strong and weak training documents, including duplicate and conflicting material.
- Show how Nugen creates synthetic training data and how developers can inspect or evaluate it.
- Provide one complete example that starts with a use case and ends with a tested production deployment.
- Add a model capability table covering alignment support, structured output, tool calling, context limits, and recommended workloads.
- Add a troubleshooting guide for technically successful alignments that fail quality tests.

## Account and model discovery

The account-verification workflow authenticated successfully and returned the available base models together with their alignment eligibility. Only a subset of the listed models was alignment-ready. The verified public API did not expose the account credit balance.

### Developer impact

- “Alignment-ready” can be confused with general model availability or inference readiness.
- Model display names and API model IDs are different. Inference required the exact lowercase, hyphenated model ID returned by the API endpoint; the dashboard display name returned `model not found` when used as an API identifier.
- Credit visibility requires leaving the API workflow and checking the dashboard.

### Suggested improvements

- Document model identifiers, display names, inference availability, and alignment eligibility as separate fields.
- Include a copyable API model ID in every relevant dashboard view.
- Expose account balance or a documented usage endpoint so applications can check credits before starting work.

## Document upload and processing

Document preparation and upload worked, including repeated status checks while Nugen processed the files. Re-uploading an existing document returned HTTP `409` with the existing document ID in the response.

### Developer impact

- A duplicate upload can be recovered, but clients must read the conflict response and reuse its `document_id` instead of treating every `409` as a fatal error.
- Processing can take long enough that progress output is important; a silent command appears stalled.
- The dashboard may show duplicate filenames from separate uploads, making it difficult to identify which document ID belongs to the current workflow.

### Suggested improvements

- Explain that a duplicate-upload conflict can be handled safely by reusing the existing document.
- Return a stable file fingerprint and the existing document record in the conflict response.
- Show document IDs and file fingerprints in the dashboard and support filtering duplicates.
- Publish expected processing durations and recommended polling intervals.

## Alignment lifecycle and monitoring

Alignment creation succeeded and returned an alignment ID. The documented 30–45 minute operation remained `PROCESSING` beyond the client’s initial 60-check polling window. A later status request returned `READY (100%)` and the aligned-model ID. During monitoring, an intermittent HTTP `500` was also observed even though the alignment ultimately completed successfully.

### Developer impact

- When client polling stops, it can look like the alignment failed even though the server is still working.
- Temporary `500` responses during a long-running operation require clients to continue checking status instead of restarting alignment.
- The dashboard and API can update at different times, so a ready model may not immediately appear in the model list.

### Suggested improvements

- Return a non-error “still processing” outcome when a recommended polling window expires.
- Publish typical and worst-case job times, recommended polling intervals, and retry guidance for temporary server failures.
- Include a suggested retry time, the last update time, and a stable job URL in alignment responses.
- Clarify when `READY`, `EVALUATED`, and deployment states become visible in the dashboard.

## Deployment behavior

The domain alignment completed successfully, and Nugen returned a ready aligned-model ID. Deployment was then requested through the documented API workflow:

1. `POST /api/v3/models/deploy-model/{model_id}` accepted the request.
2. `GET /api/v3/models/deploy-model/{model_id}/status` moved from `PENDING` to `FAILED`.
3. The task result reported: `Redeployment failed and was reverted to READY status`.
4. `GET /api/v3/models/aligned` and the dashboard both showed the model as undeployed and ready to deploy.
5. Deploying the same model from the Nugen dashboard succeeded.

This shows a difference between deployment through the API and deployment through the dashboard. The completed alignment remained valid throughout the process.

### Developer impact

- The API error did not explain why the request was treated as a redeployment.
- The model-level `READY` status and deployment-task statuses represent different lifecycle states and are easy to confuse.
- The useful failure message is nested under `result.error`; clients must inspect that field explicitly.
- A developer cannot determine from the failure response whether retrying the API request is safe or billable.
- Successful dashboard deployment provides a workaround, but it interrupts an otherwise automatable workflow.

### Suggested improvements

- Make API and dashboard deployment behavior consistent.
- Return a specific error code and actionable reason when deployment or redeployment fails.
- Clarify the distinction between alignment status, model status, and deployment-task status in one lifecycle example.
- Document whether a failed deployment request consumes credits and when retrying is safe.
- Make repeated deployment requests safe, or support a request key that prevents accidental duplicate work.
- Show the deployment task ID and detailed provider error in both the API response and dashboard.

### Positive observations

- A failed deployment safely reverted the model to a deployable state instead of damaging the completed alignment.
- The dashboard clearly displayed the model as undeployed and provided a successful recovery path.
- The deployment-status endpoint clearly returned `PENDING`, `COMPLETED`, or `FAILED`.

## Inference and model-quality observations

The first alignment used the alignment-ready `qwen-v2p5-0p5b-instruct` base model. Authentication, deployment, and inference worked, but the resulting model was not good enough for the application.

Controlled tests used identical inputs and generation settings for the base and aligned models:

- Short text-completion prompts produced off-target answers and repeated phrases until the token limit.
- A full production DomainFit prompt required structured JSON and a `hybrid` recommendation for a scenario combining stable behavior, changing evidence, private data, controlled actions, and human approval.
- Both models failed to return JSON and entered repetition loops with the production prompt.
- Repeating the production test through the documented chat-completions endpoint produced the same failure pattern.
- The aligned model showed more severe repetition than the base model, indicating that this alignment was not suitable for production use.

These results show the difference between API success and model quality. Successful alignment and deployment do not guarantee that the model can do the required job.

### Second alignment and smaller structured requests

A second alignment used `llama-v3p2-3b-reasoning` and completed, deployed, and served inference successfully. A very small focused request occasionally returned valid JSON, demonstrating that the deployed aligned endpoint was active. Repeating identical focused requests was not deterministic: earlier attempts returned malformed JSON or omitted the requested function call before a later attempt passed.

The production planner was then split into smaller tasks instead of requesting one large JSON document:

1. Architecture decision.
2. Alignment, retrieval, tool, and deterministic scopes.
3. Document readiness.
4. Held-out benchmark generation.
5. Implementation steps, risks, and safeguards.

This split made failures easier to understand, but it did not make the aligned model reliable:

- The architecture task returned the correct field first, then repeated its rationale until `max_tokens` was reached without closing the JSON.
- Reducing architecture output to one validated label avoided that specific truncation failure.
- The scope task ignored forced tool calling, sometimes returned unrelated text such as `version: stable`, and sometimes began valid JSON before entering token repetition.
- A worked input/output example helped one scope retry complete, but the first attempt still collapsed.
- The document-readiness task renamed fields (`material_readiness_score`, `gaps_and_recommendations`, or `material_needed`) despite the training examples and shared schema consistently using `score`, `gaps`, and `recommended_documents`.
- Document-readiness responses repeated phrases such as `stable behaviour clearly defined` or `approval` until truncation.
- Tool calls were consistently absent (`tool_calls: null`) in these failures even when a named function was explicitly requested.
- One experimental request to a larger Nugen-hosted model returned a completion envelope with no usable text or tool call for the scope task, so that routing experiment was removed rather than retained as an unverified fallback.

The repository’s alignment examples and JSON schema were checked after these failures. They use the intended field names, so the observed alternative fields were generated by the model rather than introduced by the application contract.

We also ran the same three isolation tests against the base and aligned models with `temperature: 0`, `max_tokens: 120`, and streaming disabled. The aligned model passed the one-label test, failed the three-bullet test, and returned a JSON value that was not an object for the tiny-JSON test. This means the current alignment can support a small classification, but it cannot reliably generate the full DomainFit plan.

We searched the uploaded repository material for the exact repeated phrases `approved follow-up actions`, `after approval from CA representative`, and `documented approval`. None of those exact phrases appeared. The word `approved` appears in valid examples, but the long repeated wording does not. The repetition may therefore come from synthetic training data created by the platform or from the model’s generation behavior, rather than direct duplication in the uploaded documents.

### API reliability observations

- Inference occasionally returned HTTP `504 Gateway Time-out` from nginx.
- Retrying could later succeed without any application change.
- Successful HTTP responses can still contain empty, truncated, repetitive, schema-invalid, or semantically incorrect model output.
- The documented function-calling parameters did not guarantee that the model would issue a tool call.
- We could not find a documented JSON-schema or constrained-output mode that guarantees the required JSON structure.

### Developer impact

- HTTP success, completed alignment, completed deployment, and useful model output are four different results. Each one needs its own check.
- A single successful smoke test is insufficient because identical requests can alternate between valid output, malformed JSON, repetition, and timeouts.
- Repair prompts can reproduce the same failure and add latency without improving validity.
- Applications need clear error details for each task, output validation, repetition detection, timeouts, and a small retry limit.
- Accepting renamed fields or incomplete JSON in application code would hide model failures and make the output unreliable.
- A small aligned model may be adequate for a short classification while remaining unsuitable for generating a complete structured plan.

### Suggested improvements

- Publish model-selection guidance for structured-output and reasoning workloads, including realistic minimum capability expectations.
- Provide pre-alignment suitability checks using the intended production prompt and schema.
- Include post-alignment quality gates for repetition, truncation, schema validity, and task-specific correctness.
- Clarify how document structure and example format influence alignment quality.
- Make it easy to compare base and aligned outputs before deployment.
- Document whether tool choice is advisory or enforced for each supported model.
- Provide a JSON-schema or constrained-output mode that guarantees the requested structure.
- Return a structured finish reason that distinguishes stop, length truncation, repetition termination, and server cancellation.
- Surface token counts and finish reasons consistently in chat-completion responses.
- Evaluate exact JSON validity and field names, not only whether the answer has a similar meaning.
- Allow developers to test the aligned model against representative prompts before spending time and credits on deployment.
- Provide guidance for when a use case exceeds the structured-output capability of an alignment-ready base model.

## Overall assessment

We completed the full platform workflow: authenticate, upload documents, create and upload a benchmark, create an alignment, monitor it, deploy the aligned model, obtain its endpoint, and send live inference requests. Nugen also confirmed that it received inference requests from the aligned model during the application review process.

The main gap is the difference between completing the platform steps and getting useful model behavior. The platform would be easier to use if the API and dashboard showed this difference clearly and tested JSON validity, repetition, task correctness, and response stability before presenting a model as ready to deploy.
