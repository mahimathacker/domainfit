"""Upload an explicitly reviewed benchmark file."""

import json

from scripts.nugen.benchmark_review import validate_nugen_benchmark
from scripts.nugen.common import ROOT, client_from_env, state_store


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.reviewed_benchmark_path:
        raise SystemExit("Review a benchmark before uploading it")
    if not state.document_ids:
        raise SystemExit("An uploaded document ID is required")
    path = ROOT / state.reviewed_benchmark_path
    validate_nugen_benchmark(json.loads(path.read_text(encoding="utf-8")))
    with client_from_env() as client:
        job = client.upload_benchmark(
            path,
            name="DomainFit Reviewed Benchmark",
            document_id=state.document_ids[0],
            description="Human-reviewed benchmark for the DomainFit alignment workflow",
        )
    state.benchmark_id = job.id
    state.complete("benchmark-upload")
    store.save(state)
    print(f"Uploaded benchmark: {job.id}")


if __name__ == "__main__":
    main()
