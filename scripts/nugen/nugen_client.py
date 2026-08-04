"""Centralized, typed client for documented Nugen API v3 operations."""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from scripts.nugen.config import NugenConfig
from scripts.nugen.models import (
    AlignmentStatus,
    BaseModelInfo,
    CompletionResponse,
    CreatedJob,
)

T = TypeVar("T")


class NugenError(RuntimeError):
    """Base exception for safe, user-facing Nugen failures."""


class NugenAuthenticationError(NugenError):
    pass


class NugenValidationError(NugenError):
    pass


class NugenCreditsError(NugenError):
    pass


class NugenRateLimitError(NugenError):
    pass


class NugenNotFoundError(NugenError):
    pass


class NugenConflictError(NugenError):
    def __init__(self, message: str, payload: Any = None) -> None:
        super().__init__(message)
        self.payload = payload


class NugenJobFailedError(NugenError):
    pass


class NugenPollingTimeoutError(NugenError):
    pass


class NugenResponseError(NugenError):
    pass


class NugenServerError(NugenError):
    """A temporary failure returned by Nugen's server."""


class NugenClient:
    """All network access to Nugen is routed through this client."""

    API_PREFIX = "/api/v3"

    def __init__(
        self,
        config: NugenConfig,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.config = config
        self._client = httpx.Client(
            base_url=config.base_url,
            headers={"Authorization": f"Bearer {config.api_key}"},
            timeout=httpx.Timeout(config.timeout_seconds),
            transport=transport,
        )

    def __enter__(self) -> NugenClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    @retry(
        retry=retry_if_exception_type(
            (httpx.NetworkError, httpx.TimeoutException, NugenServerError)
        ),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=4),
        reraise=True,
    )
    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        return self._request_once(method, path, **kwargs)

    def _request_once(self, method: str, path: str, **kwargs: Any) -> Any:
        """Send one request; callers opt into retries through ``_request``."""
        try:
            response = self._client.request(method, path, **kwargs)
        except (httpx.NetworkError, httpx.TimeoutException):
            raise

        detail = self._error_detail(response)
        if response.status_code in {401, 403}:
            raise NugenAuthenticationError(detail or "Nugen authentication failed")
        if response.status_code == 422:
            raise NugenValidationError(detail or "Nugen rejected the request")
        if response.status_code == 429:
            raise NugenRateLimitError(detail or "Nugen rate limit reached")
        if response.status_code == 404:
            raise NugenNotFoundError(detail or "Nugen resource not found")
        if response.status_code == 409:
            try:
                conflict_payload = response.json()
            except json.JSONDecodeError:
                conflict_payload = None
            raise NugenConflictError(detail or "Nugen resource conflict", conflict_payload)
        if response.status_code in {400, 402} and "credit" in detail.lower():
            raise NugenCreditsError(detail)
        if response.status_code >= 500:
            raise NugenServerError(
                f"Nugen returned HTTP {response.status_code}: {detail or 'server error'}"
            )
        if response.is_error:
            raise NugenError(f"Nugen returned HTTP {response.status_code}: {detail}")
        if not response.content:
            return None
        try:
            return response.json()
        except json.JSONDecodeError as exc:
            raise NugenResponseError("Nugen returned malformed JSON") from exc

    @staticmethod
    def _error_detail(response: httpx.Response) -> str:
        try:
            payload = response.json()
        except json.JSONDecodeError:
            return response.text[:500]
        if isinstance(payload, dict):
            detail = payload.get("detail") or payload.get("message") or payload.get("error")
            return json.dumps(detail) if not isinstance(detail, str) else detail
        return str(payload)

    @staticmethod
    def _model(model_type: type[T], payload: Any) -> T:
        try:
            if issubclass(model_type, BaseModel):
                return model_type.model_validate(payload)
        except (ValidationError, TypeError) as exc:
            message = f"Unexpected Nugen response for {model_type.__name__}"
            raise NugenResponseError(message) from exc
        raise TypeError("model_type must be a Pydantic model")

    def list_base_models(self) -> list[BaseModelInfo]:
        payload = self._request("GET", f"{self.API_PREFIX}/models/base")
        models = payload.get("models", []) if isinstance(payload, dict) else []
        try:
            return [BaseModelInfo.model_validate(item) for item in models]
        except ValidationError as exc:
            raise NugenResponseError("Unexpected base-model response") from exc

    def select_alignment_ready_model(self, preferred_id: str | None = None) -> BaseModelInfo:
        candidates = [
            model
            for model in self.list_base_models()
            if model.alignment_ready and model.is_active
        ]
        if preferred_id:
            match = next((model for model in candidates if model.id == preferred_id), None)
            if match:
                return match
            raise NugenError(f"Configured model {preferred_id!r} is not active and alignment-ready")
        if not candidates:
            raise NugenError("No active alignment-ready base model is available")
        return candidates[0]

    def upload_documents(self, paths: Iterable[Path]) -> Any:
        opened: list[Any] = []
        try:
            files = []
            for path in paths:
                handle = path.open("rb")
                opened.append(handle)
                files.append(("files", (path.name, handle, "application/octet-stream")))
            if not files:
                raise ValueError("At least one document is required")
            return self._request("POST", f"{self.API_PREFIX}/documents", files=files)
        finally:
            for handle in opened:
                handle.close()

    def get_document_status(self, task_id: str) -> Any:
        return self._request("GET", f"{self.API_PREFIX}/documents/{task_id}")

    def create_benchmark(self, document_ids: list[str], **options: Any) -> CreatedJob:
        payload = self._request(
            "POST",
            f"{self.API_PREFIX}/benchmark/create",
            json={"documents": document_ids, **options},
        )
        return self._created_job(payload)

    def get_benchmark_status(self, benchmark_id: str) -> Any:
        return self._request("GET", f"{self.API_PREFIX}/benchmark/status/{benchmark_id}")

    def get_benchmark_data(self, benchmark_id: str) -> Any:
        return self._request("GET", f"{self.API_PREFIX}/benchmark/{benchmark_id}/data")

    def upload_benchmark(
        self, path: Path, *, name: str, document_id: str, description: str | None = None
    ) -> CreatedJob:
        data = {"name": name, "document_id": document_id}
        if description:
            data["description"] = description
        with path.open("rb") as handle:
            payload = self._request(
                "POST",
                f"{self.API_PREFIX}/benchmark/upload",
                files={"file": (path.name, handle, "application/json")},
                data=data,
            )
        return self._created_job(payload)

    def create_alignment(
        self,
        *,
        name: str,
        base_model: str,
        document_ids: list[str],
        benchmark_id: str | None = None,
        description: str | None = None,
    ) -> CreatedJob:
        body: dict[str, Any] = {
            "name": name,
            "base_model": base_model,
            "document_ids": document_ids,
        }
        if benchmark_id:
            body["benchmark_id"] = benchmark_id
        if description:
            body["description"] = description
        return self._created_job(
            self._request("POST", f"{self.API_PREFIX}/alignment-project/create", json=body)
        )

    def get_alignment_status(self, alignment_id: str) -> AlignmentStatus:
        payload = self._request(
            "GET", f"{self.API_PREFIX}/alignment-project/status/{alignment_id}"
        )
        return self._normalize_alignment_status(payload, alignment_id)

    def deploy_model(self, model_id: str) -> str:
        payload = self._request("POST", f"{self.API_PREFIX}/models/deploy-model/{model_id}")
        if isinstance(payload, str):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("model_id"), str):
            return payload["model_id"]
        raise NugenResponseError("Deployment response did not contain a model ID")

    def get_deployment_status(self, model_id: str) -> Any:
        return self._request(
            "GET", f"{self.API_PREFIX}/models/deploy-model/{model_id}/status"
        )

    def list_aligned_models(self) -> Any:
        return self._request("GET", f"{self.API_PREFIX}/models/aligned")

    def complete(
        self, model: str, prompt: str, *, max_tokens: int = 1200, temperature: float = 0.1
    ) -> CompletionResponse:
        payload = self._request(
            "POST",
            f"{self.API_PREFIX}/inference/completions",
            timeout=httpx.Timeout(self.config.inference_timeout_seconds),
            json={
                "model": model,
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": False,
            },
        )
        return self._model(CompletionResponse, payload)

    def chat_complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        max_tokens: int = 1200,
        temperature: float = 0.1,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
    ) -> CompletionResponse:
        body: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if tools is not None:
            body["tools"] = tools
        if tool_choice is not None:
            body["tool_choice"] = tool_choice
        payload = self._request(
            "POST",
            f"{self.API_PREFIX}/inference/chat/completions",
            timeout=httpx.Timeout(self.config.inference_timeout_seconds),
            json=body,
        )
        return self._model(CompletionResponse, payload)

    def create_evaluation(
        self, *, model_id: str, benchmark_id: str, model_id_2: str | None = None
    ) -> CreatedJob:
        body = {"model_id": model_id, "benchmark_id": benchmark_id}
        if model_id_2:
            body["model_id_2"] = model_id_2
        payload = self._request("POST", f"{self.API_PREFIX}/evaluations", json=body)
        if isinstance(payload, dict) and "evaluation_id" in payload:
            payload = {**payload, "id": payload["evaluation_id"]}
        return self._created_job(payload)

    def get_evaluation_status(self, evaluation_id: str) -> Any:
        return self._request(
            "GET", f"{self.API_PREFIX}/evaluations/{evaluation_id}/status"
        )

    def get_evaluation_results(self, evaluation_id: str) -> Any:
        return self._request(
            "GET", f"{self.API_PREFIX}/evaluations/{evaluation_id}/results"
        )

    def poll(
        self,
        fetch: Callable[[], T],
        *,
        status_of: Callable[[T], str],
        success: set[str],
        failure: set[str] | None = None,
        max_attempts: int = 30,
        initial_delay: float = 2.0,
        max_delay: float = 30.0,
        sleep: Callable[[float], None] = time.sleep,
        on_status: Callable[[int, str, T], None] | None = None,
    ) -> T:
        failure = failure or {"FAILED", "STOPPED"}
        for attempt in range(max_attempts):
            value = fetch()
            status = status_of(value).upper()
            if on_status:
                on_status(attempt + 1, status, value)
            if status in success:
                return value
            if status in failure:
                raise NugenJobFailedError(f"Nugen job ended with status {status}")
            if attempt < max_attempts - 1:
                sleep(min(initial_delay * (2**attempt), max_delay))
        raise NugenPollingTimeoutError(f"Nugen job did not finish after {max_attempts} checks")

    @staticmethod
    def _created_job(payload: Any) -> CreatedJob:
        if not isinstance(payload, dict):
            raise NugenResponseError("Nugen job response was not an object")
        if "id" not in payload:
            for key in ("task_id", "benchmark_id", "alignment_id"):
                if key in payload:
                    payload = {**payload, "id": payload[key]}
                    break
        return NugenClient._model(CreatedJob, payload)

    @staticmethod
    def _normalize_alignment_status(payload: Any, alignment_id: str) -> AlignmentStatus:
        if not isinstance(payload, dict):
            raise NugenResponseError("Alignment status response was not an object")
        data = payload.get("data") if isinstance(payload.get("data"), dict) else None
        source = data or payload
        normalized = {
            "id": source.get("alignment_id") or source.get("id") or alignment_id,
            "status": source.get("status") or payload.get("status"),
            "progress": source.get("progress"),
            "model_id": source.get("model_id") or source.get("aligned_model_id"),
            "error": source.get("error"),
            "data": data,
        }
        return NugenClient._model(AlignmentStatus, normalized)
