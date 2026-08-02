# DomainFit architecture

DomainFit separates model administration from public inference. Python commands prepare documents, manage Nugen alignment, and save resumable state. The Next.js application exposes only planning and comparison inference.

```mermaid
flowchart LR
  subgraph Admin[Local administration]
    K[Source documents] --> P[Python workflow]
    P --> B[Reviewed benchmark]
    B --> A[Nugen alignment]
    A --> D[Deployed aligned model]
    H[Held-out scenarios] --> E[Evaluation]
    D --> E
  end

  subgraph Product[Next.js application]
    U[Planner UI] --> R1[POST /api/plan]
    C[Comparison UI] --> R2[POST /api/compare]
    R1 --> V[Parse and validate]
    V --> O[Architecture plan]
  end

  R1 --> D
  R2 --> D
  R2 --> M[Base model]
```

## Trust boundaries

- `NUGEN_API_KEY` is read only in server-side TypeScript and local Python code.
- Public routes cannot create alignments or deployments.
- Alignment and deployment commands require explicit confirmation.
- Model text is treated as untrusted, extracted as JSON, and validated. One corrective retry is allowed.
- Authorization, calculations, schema checks, and approval gates remain deterministic application logic.
- Polling and network requests have explicit limits.

## Persistence

Planner drafts and mock results use browser local storage because the demo has no authentication or database. Administrative workflow IDs use ignored `artifacts/state.json`. Generated, reviewed, held-out, and evaluation artifacts remain separate to prevent accidental benchmark leakage.

