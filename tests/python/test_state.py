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

