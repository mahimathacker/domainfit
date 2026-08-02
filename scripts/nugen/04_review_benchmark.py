"""Review a generated benchmark without overwriting the source."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.nugen.benchmark_review import review_benchmark
from scripts.nugen.common import ROOT, state_store, write_json


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", type=Path)
    args = parser.parse_args()
    store = state_store()
    state = store.load()
    generated = args.path or ROOT / str(state.metadata.get("generated_benchmark_path", ""))
    if not generated.is_file():
        raise SystemExit("Generated benchmark not found; pass its path explicitly")
    payload = json.loads(generated.read_text(encoding="utf-8"))
    findings = review_benchmark(payload)
    for finding in findings:
        print(f"Item {finding.index + 1}: {', '.join(finding.codes)}")
    if not findings:
        print("No automated quality warnings found.")
    output = ROOT / "benchmarks" / "reviewed" / f"{generated.stem}-reviewed.json"
    write_json(output, payload)
    state.reviewed_benchmark_path = str(output.relative_to(ROOT))
    state.complete("review")
    store.save(state)
    print(f"Created editable reviewed copy at {output}")


if __name__ == "__main__":
    main()

