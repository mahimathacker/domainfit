"""Run non-empty response smoke tests against a deployed model."""

from __future__ import annotations

from datetime import UTC, datetime

from scripts.nugen.common import ROOT, client_from_env, state_store, write_json

PROMPTS = [
    "Recommend an architecture for a general-purpose meeting-note rewriter.",
    "Separate alignment, retrieval, and tool responsibilities for a live support assistant.",
]


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.deployed_model_id:
        raise SystemExit("No deployed model ID is saved")
    records = []
    with client_from_env() as client:
        for prompt in PROMPTS:
            response = client.complete(state.deployed_model_id, prompt)
            text = response.text().strip()
            if not text:
                raise ValueError("Inference returned an empty response")
            records.append(
                {
                    "prompt": prompt,
                    "response": text,
                    "model": response.model,
                    "usage": response.usage,
                }
            )
    output = ROOT / "artifacts" / "inference-smoke.json"
    write_json(output, {"created_at": datetime.now(UTC).isoformat(), "responses": records})
    state.complete("inference")
    store.save(state)
    print(f"Saved {len(records)} smoke-test responses to {output}")


if __name__ == "__main__":
    main()
