"""Typed contracts for the Nugen workflow and DomainFit output."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class JobStatus(StrEnum):
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"
    DEPLOYING = "DEPLOYING"
    DEPLOYED = "DEPLOYED"
    EVALUATING = "EVALUATING"
    EVALUATED = "EVALUATED"
    UNDEPLOYED = "UNDEPLOYED"
    STOPPED = "STOPPED"


class BaseModelInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str | None = None
    alignment_ready: bool = False
    is_active: bool = True
    endpoint: str | None = None


class CreatedJob(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    status: str = JobStatus.PROCESSING


class AlignmentStatus(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str | None = None
    status: str
    progress: float | None = None
    model_id: str | None = None
    error: str | None = None
    data: dict[str, Any] | None = None


class BenchmarkItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    question: str
    answer: str | None = None
    expected_answer: str | None = None


class CompletionChoice(BaseModel):
    model_config = ConfigDict(extra="allow")
    text: str | None = None
    message: dict[str, Any] | None = None


class CompletionResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str | None = None
    model: str | None = None
    choices: list[CompletionChoice] = Field(default_factory=list)
    usage: dict[str, Any] | None = None

    def text(self) -> str:
        if not self.choices:
            return ""
        choice = self.choices[0]
        if choice.text:
            return choice.text
        if choice.message:
            content = choice.message.get("content")
            return content if isinstance(content, str) else ""
        return ""


Architecture = Literal["general_model", "alignment", "rag", "tools", "hybrid"]


class DecisionFactor(StrictModel):
    factor: str
    impact: str


class HumanReview(StrictModel):
    required: bool
    reasons: list[str]


class DocumentReadiness(StrictModel):
    score: int = Field(ge=0, le=100)
    strengths: list[str]
    gaps: list[str]
    recommended_documents: list[str]


class BenchmarkPlanItem(StrictModel):
    category: str
    question: str
    expected_answer: str
    rationale: str


class DomainFitResult(StrictModel):
    recommended_architecture: Architecture
    confidence: float = Field(ge=0, le=1)
    summary: str = Field(min_length=1)
    assumptions: list[str]
    decision_factors: list[DecisionFactor]
    alignment_scope: list[str]
    runtime_retrieval_scope: list[str]
    tool_scope: list[str]
    deterministic_logic: list[str]
    human_review: HumanReview
    document_readiness: DocumentReadiness
    benchmark_plan: list[BenchmarkPlanItem] = Field(min_length=1)
    implementation_steps: list[str]
    risks: list[str]
    limitations: list[str]

