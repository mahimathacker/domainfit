from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from scripts.nugen.config import NugenConfig
from scripts.nugen.nugen_client import (
    NugenClient,
    NugenJobFailedError,
    NugenPollingTimeoutError,
)

poll_document_tasks = import_module("scripts.nugen.02_upload_documents").poll_document_tasks
document_ids_from = import_module("scripts.nugen.02_upload_documents")._document_ids
find_aligned_model = import_module("scripts.nugen.08_deploy_model").find_aligned_model
deployment_failure_reason = import_module(
    "scripts.nugen.08_deploy_model"
).deployment_failure_reason
has_active_deployment = import_module("scripts.nugen.08_deploy_model").has_active_deployment
has_repetition_collapse = import_module(
    "scripts.nugen.09_test_inference"
).has_repetition_collapse
parse_domainfit_result = import_module(
    "scripts.nugen.09_test_inference"
).parse_domainfit_result
production_semantic_errors = import_module(
    "scripts.nugen.09_test_inference"
).production_semantic_errors
DomainFitResult = import_module("scripts.nugen.models").DomainFitResult
HumanReview = import_module("scripts.nugen.models").HumanReview
FocusedDecision = import_module("scripts.nugen.09_test_inference").FocusedDecision


def nugen() -> NugenClient:
    return NugenClient(NugenConfig(api_key="test", base_url="https://api.nugen.test"))


def test_polling_stops_when_ready() -> None:
    responses = iter([{"status": "PROCESSING"}, {"status": "READY", "id": "job-1"}])
    delays: list[float] = []
    with nugen() as instance:
        result = instance.poll(
            lambda: next(responses),
            status_of=lambda item: item["status"],
            success={"READY"},
            sleep=delays.append,
        )
    assert result["id"] == "job-1"
    assert delays == [2.0]


def test_polling_reports_each_observed_status() -> None:
    responses = iter([{"status": "PROCESSING"}, {"status": "READY"}])
    observed: list[tuple[int, str]] = []
    with nugen() as instance:
        instance.poll(
            lambda: next(responses),
            status_of=lambda item: item["status"],
            success={"READY"},
            sleep=lambda _: None,
            on_status=lambda attempt, status, _: observed.append((attempt, status)),
        )
    assert observed == [(1, "PROCESSING"), (2, "READY")]


def test_request_retries_temporary_server_errors() -> None:
    responses = iter(
        [
            httpx.Response(500, json={"detail": "Internal Server Error"}),
            httpx.Response(200, json={"models": []}),
        ]
    )

    def handler(_: httpx.Request) -> httpx.Response:
        return next(responses)

    instance = NugenClient(
        NugenConfig(api_key="test", base_url="https://api.nugen.test"),
        transport=httpx.MockTransport(handler),
    )
    with instance:
        assert instance.list_base_models() == []


def test_polling_raises_on_failed_alignment() -> None:
    with nugen() as instance, pytest.raises(NugenJobFailedError, match="FAILED"):
        instance.poll(
            lambda: {"status": "FAILED"},
            status_of=lambda item: item["status"],
            success={"READY"},
            sleep=lambda _: None,
        )


def test_polling_is_bounded() -> None:
    calls = 0

    def fetch() -> dict[str, str]:
        nonlocal calls
        calls += 1
        return {"status": "PROCESSING"}

    with nugen() as instance, pytest.raises(NugenPollingTimeoutError):
        instance.poll(
            fetch,
            status_of=lambda item: item["status"],
            success={"READY"},
            max_attempts=3,
            sleep=lambda _: None,
        )
    assert calls == 3


def test_document_tasks_are_polled_together(capsys: pytest.CaptureFixture[str]) -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        task_id = request.url.path.rsplit("/", 1)[-1]
        calls.append(task_id)
        return httpx.Response(
            200, json={"status": "READY", "document_id": f"doc-{task_id}"}
        )

    instance = NugenClient(
        NugenConfig(api_key="test", base_url="https://api.nugen.test"),
        transport=httpx.MockTransport(handler),
    )
    with instance:
        completed = poll_document_tasks(instance, ["task-1", "task-2"], sleep=lambda _: None)

    assert calls == ["task-1", "task-2"]
    assert [item["document_id"] for item in completed] == ["doc-task-1", "doc-task-2"]
    assert "task-1=READY" in capsys.readouterr().out


def test_document_id_is_read_from_nested_conflict_detail() -> None:
    assert document_ids_from({"detail": {"document_id": "doc-existing"}}) == [
        "doc-existing"
    ]


def test_aligned_model_is_found_by_model_or_alignment_id() -> None:
    payload = {
        "domain_aligned_models": [
            {
                "id": "deployed-1",
                "alignment_id": "alignment-1",
                "status": "DEPLOYING",
            }
        ]
    }

    assert find_aligned_model(payload, "deployed-1") == payload["domain_aligned_models"][0]
    assert find_aligned_model(payload, "alignment-1") == payload["domain_aligned_models"][0]
    assert find_aligned_model(payload, "missing") is None


def test_deployment_failure_reason_reads_nested_task_error() -> None:
    payload = {"status": "FAILED", "result": {"error": "Provider rejected deployment"}}

    assert deployment_failure_reason(payload) == "Provider rejected deployment"


def test_no_active_deployment_is_not_treated_as_resumable() -> None:
    payload = {
        "status": "FAILED",
        "result": {"error": "No active deployment. Model status is EVALUATED."},
    }

    assert not has_active_deployment(payload)
    assert has_active_deployment({"status": "PENDING", "result": None})


def test_repetition_collapse_detection() -> None:
    repeated = " ".join(["repeat this phrase"] * 20)
    varied = " ".join(f"word-{index}" for index in range(60))

    assert has_repetition_collapse(repeated)
    assert not has_repetition_collapse(varied)


def test_production_diagnostic_rejects_non_json() -> None:
    with pytest.raises(ValueError, match="does not contain a JSON object"):
        parse_domainfit_result("not structured output")


def test_production_semantics_reject_misassigned_scopes() -> None:
    result = DomainFitResult.model_construct(
        recommended_architecture="hybrid",
        alignment_scope=["Product guidance", "Account status"],
        runtime_retrieval_scope=["Product guidance"],
        tool_scope=["General model", "Alignment"],
        deterministic_logic=["Schema validation"],
        human_review=HumanReview(required=True, reasons=["High impact"]),
    )

    errors = production_semantic_errors(result)
    assert "alignment scope must contain stable support behavior" in errors
    assert "tool scope must contain private lookup or ticket action" in errors
    assert "deterministic logic must contain authorization or approval controls" in errors


def test_focused_decision_requires_supported_architecture() -> None:
    decision = FocusedDecision.model_validate(
        {
            "recommended_architecture": "hybrid",
            "reason": "Stable behavior, current evidence, private data, and actions differ.",
        }
    )
    assert decision.recommended_architecture == "hybrid"
    with pytest.raises(ValueError):
        FocusedDecision.model_validate(
            {"recommended_architecture": "always-align", "reason": "Invalid choice."}
        )
