"""Upload prepared documents and wait for processing."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

from scripts.nugen.common import PREPARED_DATASET, ROOT, client_from_env, state_store, status_from
from scripts.nugen.nugen_client import NugenClient, NugenJobFailedError, NugenPollingTimeoutError


def _task_ids(payload: Any) -> list[str]:
    if isinstance(payload, dict):
        document_ids = payload.get("document_ids")
        if isinstance(document_ids, list) and all(isinstance(item, str) for item in document_ids):
            return document_ids
        for key in ("task_id", "id", "upload_id"):
            if isinstance(payload.get(key), str):
                return [payload[key]]
    raise ValueError("Document upload response did not contain task IDs")


def _document_ids(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
    single = payload.get("document_id")
    if isinstance(single, str):
        return [single]
    candidates = payload.get("document_ids") or payload.get("documents") or []
    result = []
    for item in candidates:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict) and isinstance(item.get("id"), str):
            result.append(item["id"])
    return result


def poll_document_tasks(
    client: NugenClient,
    task_ids: list[str],
    *,
    max_attempts: int = 120,
    interval_seconds: float = 5.0,
    sleep: Callable[[float], None] = time.sleep,
) -> list[Any]:
    completed: dict[str, Any] = {}
    terminal_failures = {"FAILED", "STOPPED"}
    for attempt in range(1, max_attempts + 1):
        statuses: list[str] = []
        for task_id in task_ids:
            if task_id in completed:
                statuses.append(f"{task_id}=READY")
                continue
            response = client.get_document_status(task_id)
            status = status_from(response).upper()
            statuses.append(f"{task_id}={status or 'UNKNOWN'}")
            if status in {"READY", "COMPLETED"}:
                completed[task_id] = response
            elif status in terminal_failures:
                raise NugenJobFailedError(f"Document task {task_id} ended with {status}")
        print(f"Document processing {attempt}/{max_attempts}: {', '.join(statuses)}", flush=True)
        if len(completed) == len(task_ids):
            return [completed[task_id] for task_id in task_ids]
        if attempt < max_attempts:
            sleep(interval_seconds)
    raise NugenPollingTimeoutError(
        f"Documents were not ready after {max_attempts * interval_seconds:.0f} seconds"
    )


def main() -> None:
    manifest = json.loads(PREPARED_DATASET.read_text(encoding="utf-8"))
    paths = [ROOT / item["path"] for item in manifest["documents"]]
    store = state_store()
    state = store.load()
    with client_from_env() as client:
        task_ids = state.document_task_ids or (
            [state.document_task_id] if state.document_task_id else []
        )
        if not task_ids:
            response = client.upload_documents(paths)
            task_ids = _task_ids(response)
            state.document_task_ids = task_ids
            state.document_task_id = task_ids[0]
            store.save(state)
        completed = poll_document_tasks(client, task_ids)
    state.document_ids = [document_id for item in completed for document_id in _document_ids(item)]
    if not state.document_ids:
        raise ValueError("Document processing completed without document IDs")
    state.complete("upload")
    store.save(state)
    print(f"Ready document IDs: {', '.join(state.document_ids)}")


if __name__ == "__main__":
    main()
