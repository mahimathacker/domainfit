from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from scripts.nugen.config import NugenConfig
from scripts.nugen.nugen_client import (
    NugenAuthenticationError,
    NugenClient,
    NugenConflictError,
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


def test_conflict_exposes_existing_document_id() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            409,
            json={
                "detail": {
                    "message": "Already uploaded",
                    "document_id": "doc-existing",
                }
            },
        )

    with client(handler) as nugen, pytest.raises(NugenConflictError) as error:
        nugen.upload_documents([Path("knowledge/00-domainfit-guidance.json")])

    assert error.value.payload["detail"]["document_id"] == "doc-existing"


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


def test_document_upload_uses_openapi_endpoint_and_files_field(tmp_path: Path) -> None:
    document = tmp_path / "examples.jsonl"
    document.write_text('{"example":true}\n', encoding="utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/v3/documents"
        assert b'name="files"' in request.content
        assert b'examples.jsonl' in request.content
        return httpx.Response(200, json={"document_ids": ["upload-task-1"]})

    with client(handler) as nugen:
        assert nugen.upload_documents([document]) == {"document_ids": ["upload-task-1"]}


def test_document_status_uses_task_id_as_resource_path() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/documents/upload-task-1"
        return httpx.Response(200, json={"status": "READY", "document_id": "doc-1"})

    with client(handler) as nugen:
        assert nugen.get_document_status("upload-task-1")["document_id"] == "doc-1"


def test_benchmark_generation_uses_documents_field() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/benchmark/create"
        assert json.loads(request.content) == {"documents": ["doc-1"], "num_questions": 20}
        return httpx.Response(200, json={"benchmark_id": "benchmark-1", "status": "PROCESSING"})

    with client(handler) as nugen:
        job = nugen.create_benchmark(["doc-1"], num_questions=20)
    assert job.id == "benchmark-1"


def test_benchmark_upload_includes_required_multipart_fields(tmp_path: Path) -> None:
    benchmark = tmp_path / "benchmark.json"
    benchmark.write_text("[]\n", encoding="utf-8")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/benchmark/upload"
        assert b'name="file"' in request.content
        assert b'name="name"' in request.content
        assert b"DomainFit Benchmark" in request.content
        assert b'name="document_id"' in request.content
        assert b"doc-1" in request.content
        return httpx.Response(
            200, json={"benchmark_id": "benchmark-1", "status": "READY"}
        )

    with client(handler) as nugen:
        job = nugen.upload_benchmark(
            benchmark, name="DomainFit Benchmark", document_id="doc-1"
        )
    assert job.id == "benchmark-1"


@pytest.mark.parametrize(
    ("payload", "expected"),
    [("model-1", "model-1"), ({"model_id": "model-2"}, "model-2")],
)
def test_deployment_response_variants(payload, expected: str) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with client(handler) as nugen:
        assert nugen.deploy_model("aligned-1") == expected


def test_deployment_status_uses_documented_task_endpoint() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/models/deploy-model/aligned-1/status"
        return httpx.Response(200, json={"model_id": "aligned-1", "status": "PENDING"})

    with NugenClient(
        NugenConfig(api_key="test", base_url="https://api.nugen.test"),
        transport=httpx.MockTransport(handler),
    ) as nugen:
        assert nugen.get_deployment_status("aligned-1")["status"] == "PENDING"


def test_chat_completion_uses_documented_endpoint_and_messages() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v3/inference/chat/completions"
        body = json.loads(request.content)
        assert body["messages"] == [{"role": "user", "content": "prompt"}]
        return httpx.Response(
            200,
            json={
                "model": "model-1",
                "choices": [{"message": {"role": "assistant", "content": "result"}}],
            },
        )

    with NugenClient(
        NugenConfig(api_key="test", base_url="https://api.nugen.test"),
        transport=httpx.MockTransport(handler),
    ) as nugen:
        response = nugen.chat_complete(
            "model-1", [{"role": "user", "content": "prompt"}]
        )
        assert response.text() == "result"


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
