"""Generate and download a benchmark from uploaded documents."""

from __future__ import annotations

from datetime import UTC, datetime

from scripts.nugen.common import ROOT, client_from_env, state_store, status_from, write_json


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.document_ids:
        raise SystemExit("Upload documents before generating a benchmark")
    with client_from_env() as client:
        if not state.generated_benchmark_id:
            job = client.create_benchmark(state.document_ids)
            state.generated_benchmark_id = job.id
            store.save(state)
        client.poll(
            lambda: client.get_benchmark_status(state.generated_benchmark_id or ""),
            status_of=status_from,
            success={"READY"},
        )
        data = client.get_benchmark_data(state.generated_benchmark_id)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    output = ROOT / "benchmarks" / "generated" / f"benchmark-{stamp}.json"
    write_json(output, data)
    state.metadata["generated_benchmark_path"] = str(output.relative_to(ROOT))
    state.complete("benchmark")
    store.save(state)
    print(f"Saved generated benchmark to {output}")


if __name__ == "__main__":
    main()

