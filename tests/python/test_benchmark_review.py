import pytest

from scripts.nugen.benchmark_review import (
    extract_items,
    review_benchmark,
    validate_nugen_benchmark,
)


def test_extracts_nested_question_list() -> None:
    payload = {
        "data": {"questions": [{"question": "What is the approved process?", "answer": "A"}]}
    }
    assert extract_items(payload)[0]["answer"] == "A"


def test_flags_empty_simple_duplicate_and_copied_questions() -> None:
    payload = {
        "questions": [
            {"question": "What is policy?", "answer": ""},
            {"question": "What is policy?", "answer": "Use the policy."},
            {
                "question": "When should an operator escalate this incident?",
                "answer": "Immediately.",
            },
        ]
    }
    source = ["The guide asks: when should an operator escalate this incident? Follow the table."]
    findings = {finding.index: finding.codes for finding in review_benchmark(payload, source)}
    assert "empty-answer" in findings[0]
    assert "overly-simple-question" in findings[0]
    assert "duplicate-of-1" in findings[1]
    assert "question-copied-from-document" in findings[2]


def test_valid_benchmark_has_no_findings() -> None:
    payload = [
        {
            "question": "Which architecture should handle facts that change every day?",
            "expected_answer": "Use retrieval for frequently changing facts.",
        }
    ]
    assert review_benchmark(payload) == []


def test_flags_direct_field_recall_and_empty_structured_answer() -> None:
    findings = review_benchmark(
        [{"question": "What is the confidence level for this recommendation?", "answer": "[]"}]
    )
    assert findings[0].codes == ["direct-field-recall", "empty-structured-answer"]


def test_validates_nugen_upload_shape() -> None:
    payload = [
        {
            "question_num": 1,
            "question": "Which architecture should handle frequently changing approved evidence?",
            "answer": "Use retrieval so current approved evidence is supplied at runtime.",
        }
    ]
    assert validate_nugen_benchmark(payload) == payload


def test_rejects_non_sequential_question_numbers() -> None:
    payload = [
        {
            "question_num": 2,
            "question": "Which architecture should handle frequently changing approved evidence?",
            "answer": "Use retrieval so current approved evidence is supplied at runtime.",
        }
    ]
    with pytest.raises(ValueError, match="sequential"):
        validate_nugen_benchmark(payload)
