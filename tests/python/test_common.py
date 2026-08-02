import pytest

from scripts.nugen.common import require_confirmation, status_from


def test_confirmation_guard_rejects_missing_flag() -> None:
    with pytest.raises(SystemExit, match="explicit confirmation"):
        require_confirmation(False, "deploy")


def test_status_from_supports_dictionary() -> None:
    assert status_from({"status": "READY"}) == "READY"

