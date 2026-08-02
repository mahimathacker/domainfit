"""Deploy an aligned model only with explicit confirmation."""

from __future__ import annotations

import argparse
from typing import Any

from scripts.nugen.common import client_from_env, require_confirmation, state_store, status_from
from scripts.nugen.nugen_client import (
    NugenJobFailedError,
    NugenNotFoundError,
    NugenPollingTimeoutError,
)


def find_aligned_model(payload: Any, model_id: str) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    models = payload.get("domain_aligned_models", [])
    if not isinstance(models, list):
        return None
    return next(
        (
            model
            for model in models
            if isinstance(model, dict)
            and model_id in {model.get("id"), model.get("alignment_id")}
        ),
        None,
    )


def deployment_failure_reason(payload: dict[str, Any]) -> str:
    task_result = payload.get("result")
    nested_error = task_result.get("error") if isinstance(task_result, dict) else None
    return next(
        (
            str(value)
            for value in (
                nested_error,
                payload.get("failure_reason"),
                payload.get("error"),
                payload.get("message"),
            )
            if value
        ),
        "Nugen did not provide a failure reason",
    )


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
        aligned_model_id = state.aligned_model_id
        model_id = aligned_model_id
        try:
            client.get_deployment_status(model_id)
        except NugenNotFoundError:
            model_id = client.deploy_model(aligned_model_id)
            print(f"Deployment requested: {model_id}", flush=True)
        else:
            print(f"Resuming existing deployment: {model_id}", flush=True)

        observed: dict[str, Any] = {}

        def report_status(attempt: int, status: str, item: dict[str, Any]) -> None:
            observed.clear()
            observed.update(item)
            print(f"Deployment check {attempt}/30: {status}", flush=True)

        try:
            result = client.poll(
                lambda: client.get_deployment_status(model_id),
                status_of=status_from,
                success={"COMPLETED"},
                max_attempts=30,
                initial_delay=10,
                max_delay=60,
                on_status=report_status,
            )
        except NugenJobFailedError:
            reason = deployment_failure_reason(observed)
            raise SystemExit(
                f"Nugen could not deploy the model: {reason}. "
                "Do not retry repeatedly; check the dashboard or contact Nugen support."
            ) from None
        except NugenPollingTimeoutError:
            raise SystemExit(
                "Deployment is still pending on Nugen. Wait and rerun this command; "
                "it will resume an existing deployment when one is visible."
            ) from None
        inventory_model = find_aligned_model(client.list_aligned_models(), model_id)
    state.deployed_model_id = str(
        (inventory_model or {}).get("id") or result.get("model_id") or model_id
    )
    endpoint = (inventory_model or {}).get("endpoint")
    if not endpoint and isinstance(result.get("result"), dict):
        endpoint = result["result"].get("endpoint_url")
    if endpoint:
        state.metadata["deployed_model_endpoint"] = endpoint
    state.complete("deployment")
    store.save(state)
    print(f"Deployed model: {state.deployed_model_id}")
    if endpoint:
        print(f"Inference endpoint: {endpoint}")


if __name__ == "__main__":
    main()
