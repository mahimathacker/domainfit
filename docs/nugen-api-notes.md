# Nugen API implementation notes

Verified against the official [Nugen documentation index](https://docs.nugen.in/llms.txt), endpoint reference, and [Nugen cookbook](https://github.com/nugen-in/nugen-cookbook) on 2026-08-02. “Documented” means verified from public documentation; it does not claim an authenticated live request was made.

All endpoints use bearer authentication and the `https://api.nugen.in/api/v3` prefix by default.

| Operation | Method and endpoint | Request | Documented response | Status |
| --- | --- | --- | --- | --- |
| Base models | `GET /models/base` | None | `{ models: Model[] }`, including `alignment_ready` | Documented |
| Upload documents | `POST /documents/upload` | Multipart files | Async upload identifiers | Endpoint documented; multipart details need live verification |
| Document status | `GET /documents/status/{id}` | Task ID | Processing status and document IDs | Endpoint documented; identifier semantics need live verification |
| Generate benchmark | `POST /benchmark/create` | Document IDs and optional configuration | Async benchmark task | Documented; optional fields need live verification |
| Benchmark status | `GET /benchmark/status/{id}` | Benchmark ID | ID, name, status, timestamps | Documented |
| Benchmark data | `GET /benchmark/data/{id}` | Benchmark ID | Generated questions and answers | Endpoint documented; nested schema needs live verification |
| Upload benchmark | `POST /benchmark/upload` | Multipart JSON file | Benchmark ID/task | Endpoint documented; exact accepted file schema needs live verification |
| Create alignment | `POST /alignment-project/create` | `name`, `base_model`, `document_ids`, optional benchmark and description | `{ id, status }` | Documented |
| Alignment status | `GET /alignment-project/status/{id}` | Alignment ID | Status envelope or project data | Documented with inconsistent examples; normalized defensively |
| Deploy model | `POST /models/deploy-model/{model_id}` | None | Bare model ID or `{ model_id }` | Documented with inconsistent examples; both accepted |
| Deployment status | `GET /models/deployment-status/{model_id}` | Model ID | Deployment state | Endpoint documented; response needs live verification |
| Aligned models | `GET /models/aligned` | None | User aligned-model collection | Documented |
| Completion | `POST /inference/completions` | `model`, `prompt`, generation options, `stream: false` | Completion choices and optional usage | Documented |
| Evaluation | `POST /evaluations` | `model_id`, `benchmark_id`, optional `model_id_2` | Evaluation ID and status | Documented |
| Evaluation status | `GET /evaluations/{id}/status` | Evaluation ID | Status/progress | Documented |
| Evaluation results | `GET /evaluations/{id}/results` | Evaluation ID | Completed metrics and results | Documented |

## Known ambiguities

1. Document multipart field names and the relationship between upload-task and document IDs require a harmless authenticated verification.
2. The benchmark upload page does not make its exact JSON/JSONL shape unambiguous. DomainFit retains a richer internal format and must add a verified adapter before live upload.
3. Alignment status examples show both a wrapper containing `data` and a direct project object.
4. Alignment documentation refers to `model_id` and `aligned_model_id`; the client never constructs an ID and uses only returned values.
5. Deployment documentation shows both a bare string and `{ "model_id": "..." }`.
6. Native JSON Schema output enforcement is not documented. DomainFit requests JSON in the prompt and validates locally.
7. No public account-credit endpoint was found. The verification command reports this instead of inventing one.
8. `custom_metrics` appears as both an object and a list in examples, so DomainFit omits it until verified.

These items must be updated with sanitized observed requests and responses before claiming end-to-end live verification.

