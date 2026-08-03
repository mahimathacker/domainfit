"""Validate base and aligned models with the production DomainFit prompt."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import httpx
from pydantic import ValidationError

from scripts.nugen.common import ROOT, client_from_env, state_store, write_json
from scripts.nugen.models import DomainFitResult

MAX_TOKENS = 1800
TEMPERATURE = 0.1
SYSTEM_PROMPT = (
    "You are DomainFit, an architecture-planning assistant. Recommend the smallest "
    "architecture that meets the requirements. Do not recommend alignment by default. "
    "Separate stable behavior for alignment, changing evidence for retrieval, private "
    "or live data and actions for tools, and deterministic application logic. Identify "
    "assumptions and require human review for high-impact outcomes. Return only one JSON "
    "object matching the requested schema, with no markdown."
)
PRODUCTION_INPUT: dict[str, Any] = {
    "use_case": (
        "A customer-support assistant must follow a stable diagnostic and escalation "
        "process, answer from frequently updated product guidance, look up private live "
        "account status, and create a support ticket only after user approval."
    ),
    "users": "Authenticated customers and support agents",
    "domain": "Customer support",
    "stable_behaviour": "Approved diagnostic sequence, tone, and escalation rules",
    "changing_facts": "Product guidance, account status, and incident information",
    "citations_required": True,
    "live_private_data": True,
    "external_actions": True,
    "mistake_impact": "high",
    "human_approval": True,
    "available_documents": "Reviewed support conversations and current product guidance",
    "document_change_frequency": "weekly",
    "latency_requirements": "Interactive response under five seconds",
    "usage_requirements": "Pilot usage with fewer than 1,000 requests per month",
}


def build_production_user_message(planner_input: dict[str, Any]) -> str:
    formatted_input = json.dumps(planner_input, indent=2, ensure_ascii=False)
    required_fields = (
        "recommended_architecture, confidence, summary, assumptions, decision_factors, "
        "alignment_scope, runtime_retrieval_scope, tool_scope, deterministic_logic, "
        "human_review, document_readiness, benchmark_plan, implementation_steps, risks, "
        "limitations."
    )
    return f"""Planner input:
{formatted_input}

Required output fields:
{required_fields}

Architecture must be one of: general_model, alignment, rag, tools, hybrid.
Confidence must be between 0 and 1. Document readiness score must be an integer from 0 to 100.
"""


def has_repetition_collapse(text: str) -> bool:
    """Detect long responses dominated by repeated three-word sequences."""
    words = text.lower().split()
    if len(words) < 40:
        return False
    trigrams = [tuple(words[index : index + 3]) for index in range(len(words) - 2)]
    return len(set(trigrams)) / len(trigrams) < 0.35


def parse_domainfit_result(text: str) -> DomainFitResult:
    start = text.find("{")
    if start < 0:
        raise ValueError("response does not contain a JSON object")
    try:
        payload, _ = json.JSONDecoder().raw_decode(text[start:])
    except json.JSONDecodeError as exc:
        raise ValueError(f"response contains invalid JSON: {exc.msg}") from exc
    try:
        return DomainFitResult.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"response failed the DomainFit schema: {exc}") from exc


def main() -> None:
    store = state_store()
    state = store.load()
    if not state.base_model_id or not state.deployed_model_id:
        raise SystemExit("Base and deployed aligned model IDs are required")

    user_message = build_production_user_message(PRODUCTION_INPUT)
    records = []
    try:
        with client_from_env() as client:
            for index, (variant, model_id) in enumerate(
                (
                    ("base", state.base_model_id),
                    ("aligned", state.deployed_model_id),
                ),
                start=1,
            ):
                print(f"Production inference {index}/2 ({variant})...", flush=True)
                response = client.chat_complete(
                    model_id,
                    [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_message},
                    ],
                    max_tokens=MAX_TOKENS,
                    temperature=TEMPERATURE,
                )
                text = response.text().strip()
                errors = []
                parsed = None
                if not text:
                    errors.append("empty response")
                elif has_repetition_collapse(text):
                    errors.append("repetition collapse")
                try:
                    parsed = parse_domainfit_result(text)
                except ValueError as exc:
                    errors.append(str(exc))
                if parsed and parsed.recommended_architecture != "hybrid":
                    errors.append(
                        "expected hybrid for stable behavior, current evidence, private "
                        "data, controlled actions, and high-impact review"
                    )
                records.append(
                    {
                        "variant": variant,
                        "model": response.model,
                        "response": text,
                        "parsed": parsed.model_dump() if parsed else None,
                        "usage": response.usage,
                        "quality": {"passed": not errors, "errors": errors},
                    }
                )
    except (httpx.TimeoutException, httpx.NetworkError) as exc:
        raise SystemExit(
            "Nugen production inference did not return after three attempts. "
            f"Details: {exc}"
        ) from None

    output = ROOT / "artifacts" / "production-inference-diagnostic.json"
    write_json(
        output,
        {
            "created_at": datetime.now(UTC).isoformat(),
            "planner_input": PRODUCTION_INPUT,
            "generation": {"max_tokens": MAX_TOKENS, "temperature": TEMPERATURE},
            "responses": records,
        },
    )
    print(f"Saved production diagnostic to {output}")
    failures = [record for record in records if not record["quality"]["passed"]]
    if failures:
        for record in failures:
            print(f"{record['variant']} failed: {'; '.join(record['quality']['errors'])}")
        raise SystemExit("Production inference quality check failed")

    state.complete("inference")
    store.save(state)
    print("Production inference quality check passed for base and aligned models")


if __name__ == "__main__":
    main()
