from __future__ import annotations

import pytest

from scripts.nugen.config import NugenConfig
from scripts.nugen.nugen_client import (
    NugenClient,
    NugenJobFailedError,
    NugenPollingTimeoutError,
)


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

