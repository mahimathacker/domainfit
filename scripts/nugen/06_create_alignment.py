"""Create a paid alignment only with explicit confirmation."""

from __future__ import annotations

import argparse

from scripts.nugen.common import client_from_env, require_confirmation, state_store


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--name", default="DomainFit Planner")
    args = parser.parse_args()
    require_confirmation(args.confirm, "create a potentially paid alignment")
    store = state_store()
    state = store.load()
    if not state.document_ids or not state.benchmark_id:
        raise SystemExit("Uploaded document and reviewed benchmark IDs are required")
    with client_from_env() as client:
        model = client.select_alignment_ready_model(state.base_model_id)
        state.base_model_id = model.id
        job = client.create_alignment(
            name=args.name,
            base_model=model.id,
            document_ids=state.document_ids,
            benchmark_id=state.benchmark_id,
            description="DomainFit architecture-planning behaviour alignment",
        )
    state.alignment_id = job.id
    state.complete("alignment-created")
    store.save(state)
    print(f"Created alignment: {job.id}")


if __name__ == "__main__":
    main()

