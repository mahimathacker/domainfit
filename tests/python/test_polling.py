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
