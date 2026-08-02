from __future__ import annotations

import json

import httpx
import pytest

from scripts.nugen.config import NugenConfig
from scripts.nugen.nugen_client import (
    NugenAuthenticationError,
    NugenClient,
    NugenResponseError,
    NugenValidationError,
)


def client(handler) -> NugenClient:
    return NugenClient(
        NugenConfig(api_key="test-key", base_url="https://api.nugen.test"),
        transport=httpx.MockTransport(handler),
    )


def test_list_base_models_constructs_authenticated_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/api/v3/models/base"
        assert request.headers["Authorization"] == "Bearer test-key"
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "id": "base-1",
                        "name": "Base One",
                        "alignment_ready": True,
                        "is_active": True,
                    }
                ]
            },
        )

    with client(handler) as nugen:
        models = nugen.list_base_models()
    assert models[0].id == "base-1"
    assert models[0].alignment_ready is True


def test_select_alignment_ready_model_honors_preference() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "models": [
                    {"id": "first", "alignment_ready": True, "is_active": True},
                    {"id": "preferred", "alignment_ready": True, "is_active": True},
                ]
            },
        )

    with client(handler) as nugen:
        assert nugen.select_alignment_ready_model("preferred").id == "preferred"


def test_create_alignment_uses_documented_request_shape() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/alignment-project/create"
        assert json.loads(request.content) == {
            "name": "DomainFit",
            "base_model": "base-1",
            "document_ids": ["doc-1"],
            "benchmark_id": "bench-1",
        }
        return httpx.Response(200, json={"id": "alignment-1", "status": "PROCESSING"})

    with client(handler) as nugen:
        job = nugen.create_alignment(
            name="DomainFit",
            base_model="base-1",
            document_ids=["doc-1"],
            benchmark_id="bench-1",
        )
    assert job.id == "alignment-1"


@pytest.mark.parametrize(
    ("payload", "expected"),
    [("model-1", "model-1"), ({"model_id": "model-2"}, "model-2")],
)
def test_deployment_response_variants(payload, expected: str) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with client(handler) as nugen:
        assert nugen.deploy_model("aligned-1") == expected


def test_alignment_status_normalizes_envelope() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "status": "READY",
                "data": {"alignment_id": "alignment-1", "status": "READY", "model_id": "model-1"},
            },
        )

    with client(handler) as nugen:
        status = nugen.get_alignment_status("alignment-1")
    assert status.status == "READY"
    assert status.model_id == "model-1"


def test_completion_parses_chat_style_content() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"role": "assistant", "content": "result"}}]},
        )

    with client(handler) as nugen:
        assert nugen.complete("model-1", "prompt").text() == "result"


@pytest.mark.parametrize(
    ("status", "error_type"),
    [(401, NugenAuthenticationError), (403, NugenAuthenticationError), (422, NugenValidationError)],
)
def test_api_errors_are_mapped(status: int, error_type: type[Exception]) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "problem"})

    with client(handler) as nugen, pytest.raises(error_type):
        nugen.list_base_models()


def test_malformed_success_response_is_rejected() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"not-json")

    with client(handler) as nugen, pytest.raises(NugenResponseError):
        nugen.list_base_models()

