"""Compare base and aligned models with identical held-out prompts."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime

from scripts.nugen.common import ROOT, client_from_env, state_store, write_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--official-evaluation", action="store_true")
    args = parser.parse_args()
    store = state_store()
    state = store.load()
    if not state.base_model_id or not state.deployed_model_id:
        raise SystemExit("Base and deployed aligned model IDs are required")
    scenarios = json.loads(
        (ROOT / "benchmarks" / "held-out" / "domainfit-held-out.json").read_text(encoding="utf-8")
    )
    comparisons = []
    with client_from_env() as client:
        for scenario in scenarios:
            prompt = scenario["use_case"]
            base = client.complete(state.base_model_id, prompt)
            aligned = client.complete(state.deployed_model_id, prompt)
            comparisons.append(
                {
                    "scenario_id": scenario["id"],
                    "prompt": prompt,
                    "base": {"text": base.text(), "usage": base.usage},
                    "aligned": {"text": aligned.text(), "usage": aligned.usage},
                }
            )
        if args.official_evaluation:
            if not state.benchmark_id:
                raise SystemExit("An uploaded benchmark ID is required for official evaluation")
            job = client.create_evaluation(
                model_id=state.base_model_id,
                model_id_2=state.deployed_model_id,
                benchmark_id=state.benchmark_id,
            )
            state.evaluation_id = job.id
            store.save(state)
            result = client.poll(
                lambda: client.get_evaluation_status(job.id),
                status_of=lambda item: str(item.get("status", "")),
                success={"READY", "EVALUATED", "COMPLETED"},
                max_attempts=30,
                initial_delay=5,
                max_delay=60,
            )
            state.metadata["official_evaluation_status"] = result
            state.metadata["official_evaluation_results"] = client.get_evaluation_results(job.id)
    filename = f"comparison-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.json"
    output = ROOT / "evaluations" / filename
    write_json(output, {"comparisons": comparisons})
    state.complete("comparison")
    store.save(state)
    print(f"Saved comparison to {output}")


if __name__ == "__main__":
    main()
