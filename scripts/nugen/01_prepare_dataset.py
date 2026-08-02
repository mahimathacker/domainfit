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
    write_json(PREPARED_DATASET, {"documents": documents})
    total = sum(int(item["bytes"]) for item in documents)
    print(f"Prepared {len(documents)} document(s), {total:,} bytes total.")
    state = state_store().load()
    state.metadata["prepared_documents"] = documents
    state.complete("prepare")
    state_store().save(state)


if __name__ == "__main__":
    main()

