"""Quality checks for generated question/answer benchmarks."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

FIELD_RECALL_PATTERNS = (
    "what is the confidence level",
    "what is the recommendation for",
    "what is the alignment scope",
    "what is the runtime retrieval scope",
    "what is the tool scope",
)


@dataclass(slots=True)
class ReviewFinding:
    index: int
    codes: list[str] = field(default_factory=list)


def _items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("items", "questions", "benchmark", "data"):
            candidate = payload.get(key)
            if isinstance(candidate, list):
                return [item for item in candidate if isinstance(item, dict)]
            if isinstance(candidate, dict):
                nested = _items(candidate)
                if nested:
                    return nested
    return []


def review_benchmark(
    payload: Any, source_documents: list[str] | None = None
) -> list[ReviewFinding]:
    items = _items(payload)
    findings = [ReviewFinding(index=index) for index in range(len(items))]
    normalized_questions: list[str] = []
    sources = [re.sub(r"\s+", " ", source.lower()) for source in source_documents or []]

    for index, item in enumerate(items):
        question = str(item.get("question", "")).strip()
        answer = str(item.get("answer") or item.get("expected_answer") or "").strip()
        normalized = re.sub(r"\W+", " ", question.lower()).strip()
        normalized_questions.append(normalized)
        if not question:
            findings[index].codes.append("empty-question")
        if not answer:
            findings[index].codes.append("empty-answer")
        if question and len(question.split()) < 5:
            findings[index].codes.append("overly-simple-question")
        if any(pattern in question.lower() for pattern in FIELD_RECALL_PATTERNS):
            findings[index].codes.append("direct-field-recall")
        if answer in {"[]", "{}", "null", "None"}:
            findings[index].codes.append("empty-structured-answer")
        if any(normalized and normalized in source for source in sources):
            findings[index].codes.append("question-copied-from-document")

    for index, question in enumerate(normalized_questions):
        if not question:
            continue
        for previous in range(index):
            other = normalized_questions[previous]
            if other and SequenceMatcher(None, question, other).ratio() >= 0.9:
                findings[index].codes.append(f"duplicate-of-{previous + 1}")
                break
    return [finding for finding in findings if finding.codes]


def extract_items(payload: Any) -> list[dict[str, Any]]:
    return _items(payload)


def validate_nugen_benchmark(payload: Any) -> list[dict[str, Any]]:
    items = extract_items(payload)
    if not items:
        raise ValueError("Benchmark must contain at least one question")
    numbers: list[int] = []
    for index, item in enumerate(items, start=1):
        question_num = item.get("question_num")
        question = item.get("question")
        answer = item.get("answer")
        if not isinstance(question_num, int):
            raise ValueError(f"Benchmark item {index} requires an integer question_num")
        if not isinstance(question, str) or not question.strip():
            raise ValueError(f"Benchmark item {index} requires a non-empty question")
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError(f"Benchmark item {index} requires a non-empty answer")
        numbers.append(question_num)
    if numbers != list(range(1, len(items) + 1)):
        raise ValueError("Benchmark question_num values must be sequential starting at 1")
    findings = review_benchmark(items)
    if findings:
        summary = "; ".join(
            f"item {finding.index + 1}: {', '.join(finding.codes)}" for finding in findings
        )
        raise ValueError(f"Benchmark quality checks failed: {summary}")
    return items
