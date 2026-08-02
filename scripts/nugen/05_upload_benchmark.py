"""Upload an explicitly reviewed benchmark file."""

from scripts.nugen.common import ROOT, client_from_env, state_store


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.reviewed_benchmark_path:
        raise SystemExit("Review a benchmark before uploading it")
    path = ROOT / state.reviewed_benchmark_path
    with client_from_env() as client:
        job = client.upload_benchmark(path)
    state.benchmark_id = job.id
    state.complete("benchmark-upload")
    store.save(state)
    print(f"Uploaded benchmark: {job.id}")


if __name__ == "__main__":
    main()

