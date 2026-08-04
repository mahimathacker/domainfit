# Nugen Developer Experience Feedback

This document records observations from running the DomainFit alignment workflow against the live Nugen API and dashboard from 2–4 August 2026. It separates platform behavior from model-quality findings so that successful API operations are not confused with production readiness.

## Account and model discovery

The account-verification workflow authenticated successfully and returned the available base models together with their alignment eligibility. Only a subset of the listed models was alignment-ready. The verified public API did not expose the account credit balance.

### Developer impact

- “Alignment-ready” can be mistaken for general model availability or inference readiness.
- Model display names and API model IDs are different. Inference required the exact lowercase, hyphenated model ID returned by the API endpoint; the dashboard display name returned `model not found` when used as an API identifier.
- Credit visibility requires leaving the API workflow and checking the dashboard.

### Suggested improvements

- Document model identifiers, display names, inference availability, and alignment eligibility as separate fields.
- Include a copyable API model ID in every relevant dashboard view.
- Expose account balance or a documented usage endpoint for automated preflight checks.

## Document upload and processing

Document preparation and upload worked, including asynchronous readiness polling. Re-uploading an existing document returned HTTP `409` with the existing document ID in the payload.

### Developer impact

- A duplicate upload is recoverable, but clients must recognize the conflict payload and reuse `document_id` instead of treating every `409` as fatal.
- Processing can take long enough that progress output is important; a silent command appears stalled.
- The dashboard may show duplicate filenames from separate uploads, making it difficult to identify which document ID belongs to the current workflow.

### Suggested improvements

- Document duplicate-upload conflicts as an idempotent recovery path.
- Return a stable checksum and existing document record in the conflict response.
- Show document IDs and checksums in the dashboard and support filtering duplicates.
- Publish expected processing durations and recommended polling intervals.

## Alignment lifecycle and monitoring

Alignment creation succeeded and returned an alignment ID. The documented 30–45 minute operation remained `PROCESSING` beyond the client’s initial 60-check polling window. A later status request returned `READY (100%)` and the aligned-model ID. During monitoring, an intermittent HTTP `500` was also observed even though the alignment ultimately completed successfully.

### Developer impact

- A client-side polling timeout can look like an alignment failure even though the server job is still healthy.
- Transient `500` responses during a long-running operation require resumable polling rather than restarting alignment.
- The dashboard and API can update at different times, so a ready model may not immediately appear in the model list.

### Suggested improvements

- Return a non-error “still processing” outcome when a recommended polling window expires.
- Publish job-duration percentiles, polling intervals, and retry guidance for transient server failures.
- Include `retry_after`, last-updated time, and a stable job URL in alignment responses.
- Clarify when `READY`, `EVALUATED`, and deployment states become visible in the dashboard.

## Deployment behavior

The domain alignment completed successfully, and Nugen returned a ready aligned-model ID. Deployment was then requested through the documented API workflow:

1. `POST /api/v3/models/deploy-model/{model_id}` accepted the request.
2. `GET /api/v3/models/deploy-model/{model_id}/status` moved from `PENDING` to `FAILED`.
3. The task result reported: `Redeployment failed and was reverted to READY status`.
4. `GET /api/v3/models/aligned` and the dashboard both showed the model as undeployed and ready to deploy.
5. Deploying the same model from the Nugen dashboard succeeded.

This indicates a difference between API-triggered and dashboard-triggered deployment behavior. The alignment artifact itself remained valid throughout the process.

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
- Provide an idempotent deployment operation or an idempotency key so clients can resume safely after uncertain responses.
- Show the deployment task ID and detailed provider error in both the API response and dashboard.

### Positive observations

- A failed deployment safely reverted the model to a deployable state instead of damaging the completed alignment.
- The dashboard clearly displayed the model as undeployed and provided a successful recovery path.
- The dedicated deployment-status endpoint exposed a bounded `PENDING`, `COMPLETED`, or `FAILED` lifecycle.

## Inference and model-quality observations

The first alignment used the alignment-ready `qwen-v2p5-0p5b-instruct` base model. Connectivity, authentication, deployment, and response parsing were verified successfully, but the resulting model did not meet the application-quality threshold.

Controlled tests used identical inputs and generation settings for the base and aligned models:

- Short text-completion prompts produced off-target answers and repeated phrases until the token limit.
- A full production DomainFit prompt required structured JSON and a `hybrid` recommendation for a scenario combining stable behavior, changing evidence, private data, controlled actions, and human approval.
- Both models failed to return JSON and entered repetition loops with the production prompt.
- Repeating the production test through the documented chat-completions endpoint produced the same failure pattern.
- The aligned model showed more severe repetition than the base model, indicating that this alignment was not suitable for production use.

These results distinguish API success from model quality: a successful alignment and deployment do not guarantee that the resulting model satisfies the application contract.

### Second alignment and bounded structured inference

A second alignment used `llama-v3p2-3b-reasoning` and completed, deployed, and served inference successfully. A very small focused request occasionally returned valid JSON, demonstrating that the deployed aligned endpoint was active. Repeating identical focused requests was not deterministic: earlier attempts returned malformed JSON or omitted the requested function call before a later attempt passed.

The production planner was then decomposed into bounded tasks rather than requesting one large JSON document:

1. Architecture decision.
2. Alignment, retrieval, tool, and deterministic scopes.
3. Document readiness.
4. Held-out benchmark generation.
5. Implementation steps, risks, and safeguards.

This decomposition improved diagnosis but did not make the aligned model reliable:

- The architecture task returned the correct field first, then repeated its rationale until `max_tokens` was reached without closing the JSON.
- Reducing architecture output to one validated label avoided that specific truncation failure.
- The scope task ignored forced tool calling, sometimes returned unrelated text such as `version: stable`, and sometimes began valid JSON before entering token repetition.
- A worked input/output example helped one scope retry complete, but the first attempt still collapsed.
- The document-readiness task renamed fields (`material_readiness_score`, `gaps_and_recommendations`, or `material_needed`) despite the training examples and shared schema consistently using `score`, `gaps`, and `recommended_documents`.
- Document-readiness responses repeated phrases such as `stable behaviour clearly defined` or `approval` until truncation.
- Tool calls were consistently absent (`tool_calls: null`) in these failures even when a named function was explicitly requested.
- One experimental request to a larger Nugen-hosted model returned a completion envelope with no usable text or tool call for the scope task, so that routing experiment was removed rather than retained as an unverified fallback.

The repository’s alignment examples and JSON schema were checked after these failures. They use the intended field names, so the observed alternative fields were generated by the model rather than introduced by the application contract.

### API reliability observations

- Inference occasionally returned HTTP `504 Gateway Time-out` from nginx.
- Retrying could later succeed without any application change.
- Successful HTTP responses can still contain empty, truncated, repetitive, schema-invalid, or semantically incorrect model output.
- The documented function-calling parameters did not guarantee that the model would issue a tool call.
- No documented constrained-decoding or JSON-schema response mode was available to enforce the response grammar.

### Developer impact

- HTTP success, alignment completion, deployment completion, and application-quality success are four separate states that require separate checks.
- A single successful smoke test is insufficient because identical requests can alternate between valid output, malformed JSON, repetition, and timeouts.
- Repair prompts can reproduce the same failure and add latency without improving validity.
- Applications need task-level diagnostics, schema validation, repetition detection, timeouts, and bounded retries.
- Client-side acceptance of renamed fields or partial JSON would conceal model-quality failures and make the application contract unreliable.
- A small aligned model may be adequate for a short classification while remaining unsuitable for generating a complete structured plan.

### Suggested improvements

- Publish model-selection guidance for structured-output and reasoning workloads, including realistic minimum capability expectations.
- Provide pre-alignment suitability checks using the intended production prompt and schema.
- Include post-alignment quality gates for repetition, truncation, schema validity, and task-specific correctness.
- Clarify how document structure and example format influence alignment quality.
- Make it easy to compare base and aligned outputs before deployment.
- Document whether tool choice is advisory or enforced for each supported model.
- Provide a native JSON-schema or grammar-constrained response mode.
- Return a structured finish reason that distinguishes stop, length truncation, repetition termination, and server cancellation.
- Surface token counts and finish reasons consistently in chat-completion responses.
- Add alignment evaluation metrics for exact schema validity and field-name adherence, not only semantic similarity.
- Allow developers to test the aligned artifact against representative prompts before incurring deployment time.
- Provide guidance for when a use case exceeds the structured-output capability of an alignment-ready base model.

## Overall assessment

The end-to-end platform workflow was achievable: authenticate, upload documents, create and upload a benchmark, create an alignment, monitor it, deploy the aligned model, obtain its endpoint, and send live inference requests. Nugen also confirmed receipt of aligned-model inference as part of the application review workflow.

The primary gap is the distance between lifecycle success and usable model behavior. The platform would be easier to adopt if its API and dashboard made that distinction explicit and supplied first-class evaluation gates for schema validity, repetition, task correctness, and inference stability before a model is presented as deployment-ready.
