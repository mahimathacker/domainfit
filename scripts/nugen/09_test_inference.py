"""Compare basic inference quality before running the full evaluation."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx

from scripts.nugen.common import ROOT, client_from_env, state_store, write_json

PROMPTS = [
    "Recommend an architecture for a general-purpose meeting-note rewriter.",
    "Separate alignment, retrieval, and tool responsibilities for a live support assistant.",
]
MAX_TOKENS = 250
TEMPERATURE = 0.7


def has_repetition_collapse(text: str) -> bool:
    """Detect long responses dominated by repeated three-word sequences."""
    words = text.lower().split()
    if len(words) < 40:
        return False
    trigrams = [tuple(words[index : index + 3]) for index in range(len(words) - 2)]
    return len(set(trigrams)) / len(trigrams) < 0.35


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.base_model_id or not state.deployed_model_id:
        raise SystemExit("Base and deployed aligned model IDs are required")
    records = []
    try:
        with client_from_env() as client:
            models = {
                "base": state.base_model_id,
                "aligned": state.deployed_model_id,
            }
            request_count = len(PROMPTS) * len(models)
            request_index = 0
            for prompt in PROMPTS:
                for variant, model_id in models.items():
                    request_index += 1
                    print(
                        f"Inference request {request_index}/{request_count} ({variant})...",
                        flush=True,
                    )
                    response = client.complete(
                        model_id,
                        prompt,
                        max_tokens=MAX_TOKENS,
                        temperature=TEMPERATURE,
                    )
                    text = response.text().strip()
                    records.append(
                        {
                            "variant": variant,
                            "prompt": prompt,
                            "response": text,
                            "model": response.model,
                            "usage": response.usage,
                            "quality": {
                                "non_empty": bool(text),
                                "repetition_collapse": has_repetition_collapse(text),
                            },
                        }
                    )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise SystemExit(
            "Nugen inference did not return after three attempts. Wait before trying "
            "again, or increase NUGEN_INFERENCE_TIMEOUT_SECONDS. "
            f"Details: {exc}"
        ) from None
    output = ROOT / "artifacts" / "inference-smoke.json"
    write_json(
        output,
        {
            "created_at": datetime.now(UTC).isoformat(),
            "generation": {"max_tokens": MAX_TOKENS, "temperature": TEMPERATURE},
            "responses": records,
        },
    )
    failures = [
        record
        for record in records
        if not record["quality"]["non_empty"]
        or record["quality"]["repetition_collapse"]
    ]
    print(f"Saved {len(records)} diagnostic responses to {output}")
    if failures:
        failed_variants = ", ".join(
            f"{record['variant']} ({record['prompt'][:35]}...)" for record in failures
        )
        raise SystemExit(f"Inference quality check failed: {failed_variants}")
    state.complete("inference")
    store.save(state)
    print("Inference quality check passed for base and aligned models")


if __name__ == "__main__":
    main()
