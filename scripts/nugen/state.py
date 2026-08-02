"""Atomic, resumable state for the local Nugen workflow."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PipelineState(BaseModel):
    model_config = ConfigDict(extra="allow")
    completed_steps: list[str] = Field(default_factory=list)
    document_task_id: str | None = None
    document_task_ids: list[str] = Field(default_factory=list)
    document_ids: list[str] = Field(default_factory=list)
    generated_benchmark_id: str | None = None
    reviewed_benchmark_path: str | None = None
    benchmark_id: str | None = None
    base_model_id: str | None = None
    alignment_id: str | None = None
    aligned_model_id: str | None = None
    deployed_model_id: str | None = None
    evaluation_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    def complete(self, step: str) -> None:
        if step not in self.completed_steps:
            self.completed_steps.append(step)

    def reset_after_dataset_change(self) -> None:
        """Discard downstream IDs so changed source data cannot reuse stale resources."""
        self.completed_steps = [step for step in self.completed_steps if step == "verify"]
        self.document_task_id = None
        self.document_task_ids = []
        self.document_ids = []
        self.generated_benchmark_id = None
        self.reviewed_benchmark_path = None
        self.benchmark_id = None
        self.alignment_id = None
        self.aligned_model_id = None
        self.deployed_model_id = None
        self.evaluation_id = None
        for key in (
            "generated_benchmark_path",
            "official_evaluation_status",
            "official_evaluation_results",
        ):
            self.metadata.pop(key, None)


class StateStore:
    def __init__(self, path: Path = Path("artifacts/state.json")) -> None:
        self.path = path

    def load(self) -> PipelineState:
        if not self.path.exists():
            return PipelineState()
        return PipelineState.model_validate_json(self.path.read_text(encoding="utf-8"))

    def save(self, state: PipelineState) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(
            prefix=f".{self.path.name}.", dir=self.path.parent, text=True
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(state.model_dump_json(indent=2))
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
