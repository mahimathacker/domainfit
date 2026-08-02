"""Deploy an aligned model only with explicit confirmation."""

from __future__ import annotations

import argparse

from scripts.nugen.common import client_from_env, require_confirmation, state_store, status_from


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    require_confirmation(args.confirm, "deploy an aligned model")
    store = state_store()
    state = store.load()
    if not state.aligned_model_id:
        raise SystemExit("No ready aligned model ID is saved")
    with client_from_env() as client:
        model_id = client.deploy_model(state.aligned_model_id)
        client.poll(
            lambda: client.get_deployment_status(model_id),
            status_of=status_from,
            success={"DEPLOYED", "READY"},
            max_attempts=30,
            initial_delay=10,
            max_delay=60,
        )
    state.deployed_model_id = model_id
    state.complete("deployment")
    store.save(state)
    print(f"Deployed model: {model_id}")


if __name__ == "__main__":
    main()

