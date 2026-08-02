"""Upload prepared documents and wait for processing."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.nugen.common import PREPARED_DATASET, ROOT, client_from_env, state_store, status_from


def _task_id(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("task_id", "id", "upload_id"):
            if isinstance(payload.get(key), str):
                return payload[key]
    raise ValueError("Document upload response did not contain a task ID")


def _document_ids(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []
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
        if not state.document_task_id:
            response = client.upload_documents(paths)
            state.document_task_id = _task_id(response)
            store.save(state)
        completed = client.poll(
            lambda: client.get_document_status(state.document_task_id or ""),
            status_of=status_from,
            success={"READY", "COMPLETED"},
        )
    state.document_ids = _document_ids(completed)
    if not state.document_ids:
        raise ValueError("Document processing completed without document IDs")
    state.complete("upload")
    store.save(state)
    print(f"Ready document IDs: {', '.join(state.document_ids)}")


if __name__ == "__main__":
    main()

