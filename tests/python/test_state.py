from pathlib import Path

from scripts.nugen.state import PipelineState, StateStore


def test_missing_state_starts_clean(tmp_path: Path) -> None:
    state = StateStore(tmp_path / "state.json").load()
    assert state.completed_steps == []
    assert state.document_ids == []


def test_state_round_trip_supports_resume(tmp_path: Path) -> None:
    store = StateStore(tmp_path / "nested" / "state.json")
    state = PipelineState(document_ids=["doc-1"], benchmark_id="bench-1")
    state.complete("upload")
    state.complete("upload")
    store.save(state)

    resumed = store.load()
    assert resumed.document_ids == ["doc-1"]
    assert resumed.benchmark_id == "bench-1"
    assert resumed.completed_steps == ["upload"]


def test_dataset_change_clears_downstream_resources() -> None:
    state = PipelineState(
        completed_steps=["verify", "prepare", "upload", "alignment-ready"],
        document_task_id="task-1",
        document_task_ids=["task-1"],
        document_ids=["doc-1"],
        generated_benchmark_id="benchmark-generated",
        benchmark_id="benchmark-reviewed",
        alignment_id="alignment-1",
        aligned_model_id="aligned-1",
        deployed_model_id="deployed-1",
        evaluation_id="evaluation-1",
        metadata={"generated_benchmark_path": "benchmarks/generated/old.json"},
    )

    state.reset_after_dataset_change()

    assert state.completed_steps == ["verify"]
    assert state.document_ids == []
    assert state.benchmark_id is None
    assert state.alignment_id is None
    assert state.deployed_model_id is None
    assert "generated_benchmark_path" not in state.metadata
