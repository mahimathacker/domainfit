"""Verify credentials and report alignment-ready base models."""

from scripts.nugen.common import client_from_env, state_store


def main() -> None:
    with client_from_env() as client:
        models = client.list_base_models()
        selected = client.select_alignment_ready_model(client.config.base_model)
    ready = [model for model in models if model.alignment_ready and model.is_active]
    print(f"Authenticated. Found {len(models)} base model(s).")
    for model in models:
        marker = "alignment-ready" if model in ready else "not alignment-ready"
        print(f"- {model.id}: {marker}")
    print("Credit balance is not exposed by the verified public API documentation.")
    print(f"Selected alignment base model: {selected.id}")
    state = state_store().load()
    state.base_model_id = selected.id
    state.complete("verify")
    state_store().save(state)


if __name__ == "__main__":
    main()
