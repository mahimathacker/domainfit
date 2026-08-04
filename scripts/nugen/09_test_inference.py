"""Validate base and aligned models with the production DomainFit prompt."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from scripts.nugen.common import ROOT, client_from_env, state_store, write_json
from scripts.nugen.models import DomainFitResult
from scripts.nugen.nugen_client import NugenServerError

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
OUTPUT_CONTRACT = """{
  "recommended_architecture": "general_model | alignment | rag | tools | hybrid",
  "confidence": 0.0,
  "summary": "string",
  "assumptions": ["string"],
  "decision_factors": [{"factor": "string", "impact": "string"}],
  "alignment_scope": ["string"],
  "runtime_retrieval_scope": ["string"],
  "tool_scope": ["string"],
  "deterministic_logic": ["string"],
  "human_review": {"required": true, "reasons": ["string"]},
  "document_readiness": {
    "score": 0,
    "strengths": ["string"],
    "gaps": ["string"],
    "recommended_documents": ["string"]
  },
  "benchmark_plan": [{
    "category": "string",
    "question": "string",
    "expected_answer": "string",
    "rationale": "string"
  }],
  "implementation_steps": ["string"],
  "risks": ["string"],
  "limitations": ["string"]
}"""
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


class FocusedDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recommended_architecture: Literal[
        "general_model", "alignment", "rag", "tools", "hybrid"
    ]
    reason: str = Field(min_length=10, max_length=500)


FOCUSED_TOOL = {
    "type": "function",
    "function": {
        "name": "submit_domainfit_decision",
        "description": "Submit the final DomainFit architecture decision.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "recommended_architecture": {
                    "type": "string",
                    "enum": ["general_model", "alignment", "rag", "tools", "hybrid"],
                },
                "reason": {"type": "string"},
            },
            "required": ["recommended_architecture", "reason"],
        },
    },
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

Required JSON shape (replace placeholder values, preserve every value type):
{OUTPUT_CONTRACT}

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


def production_semantic_errors(result: DomainFitResult) -> list[str]:
    errors = []
    alignment = " ".join(result.alignment_scope).lower()
    retrieval = " ".join(result.runtime_retrieval_scope).lower()
    tools = " ".join(result.tool_scope).lower()
    controls = " ".join(result.deterministic_logic).lower()
    if result.recommended_architecture != "hybrid":
        errors.append("expected hybrid architecture")
    if not any(term in alignment for term in ("diagnostic", "tone", "escalation")):
        errors.append("alignment scope must contain stable support behavior")
    if not any(term in retrieval for term in ("guidance", "incident")):
        errors.append("retrieval scope must contain changing approved evidence")
    if not any(term in tools for term in ("account", "ticket")):
        errors.append("tool scope must contain private lookup or ticket action")
    if not any(term in controls for term in ("authoriz", "approval", "idempot")):
        errors.append("deterministic logic must contain authorization or approval controls")
    if not result.human_review.required:
        errors.append("high-impact workflow must require human review")
    return errors


def parse_focused_tool_call(response: Any) -> FocusedDecision:
    if not response.choices or not response.choices[0].message:
        raise ValueError("response did not contain an assistant message")
    tool_calls = response.choices[0].message.get("tool_calls")
    if not isinstance(tool_calls, list) or not tool_calls:
        raise ValueError("response did not call submit_domainfit_decision")
    function = tool_calls[0].get("function") if isinstance(tool_calls[0], dict) else None
    if not isinstance(function, dict) or function.get("name") != "submit_domainfit_decision":
        raise ValueError("response called an unexpected function")
    arguments = function.get("arguments")
    if isinstance(arguments, str):
        try:
            arguments = json.loads(arguments)
        except json.JSONDecodeError as exc:
            raise ValueError(f"tool arguments contain invalid JSON: {exc.msg}") from exc
    try:
        return FocusedDecision.model_validate(arguments)
    except ValidationError as exc:
        raise ValueError(f"tool arguments failed validation: {exc}") from exc


def parse_focused_output(response: Any) -> tuple[FocusedDecision, str]:
    try:
        return parse_focused_tool_call(response), "tool_call"
    except ValueError as tool_error:
        text = response.text().strip()
        start = text.find("{")
        if start < 0:
            raise ValueError(f"{tool_error}; response content did not contain JSON") from None
        try:
            payload, _ = json.JSONDecoder().raw_decode(text[start:])
            return FocusedDecision.model_validate(payload), "content_json"
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ValueError(f"{tool_error}; response content was invalid: {exc}") from exc


def run_focused_aligned_test() -> None:
    store = state_store()
    state = store.load()
    if not state.deployed_model_id:
        raise SystemExit("A deployed aligned model ID is required")
    messages = [
        {
            "role": "system",
            "content": (
                "You are DomainFit. Choose exactly one architecture from general_model, "
                "alignment, rag, tools, or hybrid. Return only valid JSON with exactly "
                "the keys recommended_architecture and reason."
            ),
        },
        {
            "role": "user",
            "content": (
                "A low-risk assistant rewrites ordinary notes with no specialist "
                "behavior, changing facts, private data, or actions."
            ),
        },
        {
            "role": "assistant",
            "content": (
                '{"recommended_architecture":"general_model","reason":"Rewriting is '
                'a broad capability and requires no specialist behavior or runtime data."}'
            ),
        },
        {
            "role": "user",
            "content": (
                "A support assistant needs stable diagnostic behavior, current cited "
                "guidance, private account lookup, and ticket creation after approval. "
                "Return the same two-key JSON shape for this scenario."
            ),
        },
    ]
    print("Focused aligned-model inference 1/1...", flush=True)
    try:
        with client_from_env() as client:
            response = client.chat_complete(
                state.deployed_model_id,
                messages,
                max_tokens=150,
                temperature=0.2,
                tools=[FOCUSED_TOOL],
                tool_choice={
                    "type": "function",
                    "function": {"name": "submit_domainfit_decision"},
                },
            )
    except (httpx.TimeoutException, httpx.NetworkError, NugenServerError) as exc:
        raise SystemExit(
            "Focused aligned inference did not return after Nugen retries. This is a "
            f"remote inference-service failure, not a JSON validation failure: {exc}"
        ) from None
    text = response.text().strip()
    errors = []
    parsed = None
    structured_via = None
    try:
        parsed, structured_via = parse_focused_output(response)
    except ValueError as exc:
        errors.append(f"invalid focused tool call: {exc}")
    if has_repetition_collapse(text):
        errors.append("repetition collapse")
    if parsed and parsed.recommended_architecture != "hybrid":
        errors.append("expected hybrid architecture")
    output = ROOT / "artifacts" / "focused-aligned-inference.json"
    write_json(
        output,
        {
            "created_at": datetime.now(UTC).isoformat(),
            "model": response.model,
            "messages": messages,
            "response": text,
            "raw_completion": response.model_dump(),
            "parsed": parsed.model_dump() if parsed else None,
            "structured_via": structured_via,
            "usage": response.usage,
            "quality": {"passed": not errors, "errors": errors},
        },
    )
    print(f"Saved focused aligned-model result to {output}")
    if errors:
        raise SystemExit(f"Focused aligned-model test failed: {'; '.join(errors)}")
    print("Focused aligned-model test passed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--focused-aligned", action="store_true")
    args = parser.parse_args()
    if args.focused_aligned:
        run_focused_aligned_test()
        return

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
                if parsed:
                    errors.extend(production_semantic_errors(parsed))
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
    except (httpx.TimeoutException, httpx.NetworkError, NugenServerError) as exc:
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
