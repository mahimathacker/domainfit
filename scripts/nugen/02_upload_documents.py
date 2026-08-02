"""Upload prepared documents and wait for processing."""

from __future__ import annotations

import json
from typing import Any

from scripts.nugen.common import PREPARED_DATASET, ROOT, client_from_env, state_store, status_from


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
        completed = [
            client.poll(
                lambda task_id=task_id: client.get_document_status(task_id),
                status_of=status_from,
                success={"READY", "COMPLETED"},
            )
            for task_id in task_ids
        ]
    state.document_ids = [document_id for item in completed for document_id in _document_ids(item)]
    if not state.document_ids:
        raise ValueError("Document processing completed without document IDs")
    state.complete("upload")
    store.save(state)
    print(f"Ready document IDs: {', '.join(state.document_ids)}")


if __name__ == "__main__":
    main()
