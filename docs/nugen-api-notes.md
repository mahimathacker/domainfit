# Nugen API implementation notes

Verified against the official [Nugen documentation index](https://docs.nugen.in/llms.txt), endpoint reference, and [Nugen cookbook](https://github.com/nugen-in/nugen-cookbook) on 2026-08-02. “Documented” means verified from public documentation; it does not claim an authenticated live request was made.

All endpoints use bearer authentication and the `https://api.nugen.in/api/v3` prefix by default.

| Operation | Method and endpoint | Request | Documented response | Status |
| --- | --- | --- | --- | --- |
| Base models | `GET /models/base` | None | `{ models: Model[] }`, including `alignment_ready` | Documented |
| Upload documents | `POST /documents` | Multipart `files[]`; optional `categories[]` | `{ document_ids: string[] }` containing upload task IDs | Verified from public OpenAPI |
| Document status | `GET /documents/{id}` | Upload task ID | `status` and final `document_id` when ready | Verified from public OpenAPI |
| Generate benchmark | `POST /benchmark/create` | Document IDs and optional configuration | Async benchmark task | Documented; optional fields need live verification |
| Benchmark status | `GET /benchmark/status/{id}` | Benchmark ID | ID, name, status, timestamps | Documented |
| Benchmark data | `GET /benchmark/{id}/data` | Benchmark ID | Generated questions and answers | Verified from public OpenAPI |
| Upload benchmark | `POST /benchmark/upload` | Multipart `file`, `name`, `document_id`, optional `description` | Uploaded benchmark metadata and questions | Request verified from public OpenAPI |
| Create alignment | `POST /alignment-project/create` | `name`, `base_model`, `document_ids`, optional benchmark and description | `{ id, status }` | Documented |
| Alignment status | `GET /alignment-project/status/{id}` | Alignment ID | Status envelope or project data | Documented with inconsistent examples; normalized defensively |
| Deploy model | `POST /models/deploy-model/{model_id}` | None | Bare model ID or `{ model_id }` | Documented with inconsistent examples; both accepted |
| Deployment status | `GET /models/deploy-model/{model_id}/status` | Model ID | `PENDING`, `COMPLETED`, or `FAILED` | Poll until terminal status |
| Aligned model inventory | `GET /models/aligned` | None | Models, states, and inference endpoints | Read after deployment completes |
| Aligned models | `GET /models/aligned` | None | User aligned-model collection | Documented |
| Completion | `POST /inference/completions` | `model`, `prompt`, generation options, `stream: false` | Completion choices and optional usage | Documented |
| Evaluation | `POST /evaluations` | `model_id`, `benchmark_id`, optional `model_id_2` | Evaluation ID and status | Documented |
| Evaluation status | `GET /evaluations/{id}/status` | Evaluation ID | Status/progress | Documented |
| Evaluation results | `GET /evaluations/{id}/results` | Evaluation ID | Completed metrics and results | Documented |

## Known ambiguities

1. Document upload now follows the OpenAPI-defined `files` array and returns one upload task ID per file; the live response still needs to be observed and recorded.
2. Benchmark upload requires questions shaped as `question_num`, `question`, and `answer`. DomainFit retains a richer internal format and must convert the reviewed artifact before upload.
3. Alignment status examples show both a wrapper containing `data` and a direct project object.
4. Alignment documentation refers to `model_id` and `aligned_model_id`; the client never constructs an ID and uses only returned values.
5. Deployment documentation shows both a bare string and `{ "model_id": "..." }`.
6. Native JSON Schema output enforcement is not documented. DomainFit requests JSON in the prompt and validates locally.
7. No public account-credit endpoint was found. The verification command reports this instead of inventing one.
8. `custom_metrics` appears as both an object and a list in examples, so DomainFit omits it until verified.

These items must be updated with sanitized observed requests and responses before claiming end-to-end live verification.
