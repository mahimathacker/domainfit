"""Monitor an alignment with bounded exponential polling."""

from scripts.nugen.common import client_from_env, state_store


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.alignment_id:
        raise SystemExit("No alignment ID is saved")
    with client_from_env() as client:
        result = client.poll(
            lambda: client.get_alignment_status(state.alignment_id or ""),
            status_of=lambda item: item.status,
            success={"READY"},
            failure={"FAILED", "STOPPED"},
            max_attempts=60,
            initial_delay=10,
            max_delay=120,
            on_status=lambda attempt, status, item: print(
                f"Alignment check {attempt}/60: {status}"
                + (f" ({item.progress:.0f}%)" if item.progress is not None else ""),
                flush=True,
            ),
        )
    if not result.model_id:
        raise ValueError("Alignment is READY but did not return a model ID")
    state.aligned_model_id = result.model_id
    state.complete("alignment-ready")
    store.save(state)
    print(f"Aligned model ready: {result.model_id}")


if __name__ == "__main__":
    main()
