"""Validate and inventory files prepared for Nugen document upload."""

from __future__ import annotations

import hashlib
from pathlib import Path

from scripts.nugen.common import PREPARED_DATASET, ROOT, state_store, write_json

ALLOWED_SUFFIXES = {".md", ".txt", ".json", ".jsonl", ".pdf"}
SECRET_MARKERS = ("NUGEN_API_KEY=", "BEGIN PRIVATE KEY", "Bearer sk-")


def prepare(source: Path = ROOT / "knowledge") -> list[dict[str, object]]:
    documents: list[dict[str, object]] = []
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        content = path.read_bytes()
        if path.suffix.lower() != ".pdf":
            text = content.decode("utf-8")
            if any(marker in text for marker in SECRET_MARKERS):
                raise ValueError(f"Potential secret found in {path}")
        documents.append(
            {
                "path": str(path.relative_to(ROOT)),
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    if not documents:
        raise ValueError(f"No supported documents found under {source}")
    return documents


def main() -> None:
    documents = prepare()
    fingerprint = hashlib.sha256(
        "".join(str(item["sha256"]) for item in documents).encode("utf-8")
    ).hexdigest()
    write_json(PREPARED_DATASET, {"documents": documents})
    total = sum(int(item["bytes"]) for item in documents)
    print(f"Prepared {len(documents)} document(s), {total:,} bytes total.")
    store = state_store()
    state = store.load()
    previous_fingerprint = state.metadata.get("dataset_fingerprint")
    if previous_fingerprint != fingerprint and state.document_ids:
        state.reset_after_dataset_change()
        print("Dataset changed; cleared saved downstream resource IDs.")
    state.metadata["prepared_documents"] = documents
    state.metadata["dataset_fingerprint"] = fingerprint
    state.complete("prepare")
    store.save(state)


if __name__ == "__main__":
    main()
