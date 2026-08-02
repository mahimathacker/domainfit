"""Shared command-line helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scripts.nugen.config import NugenConfig
from scripts.nugen.nugen_client import NugenClient
from scripts.nugen.state import StateStore

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "artifacts"
PREPARED_DATASET = ARTIFACTS / "prepared-documents.json"
STATE_PATH = ARTIFACTS / "state.json"


def client_from_env() -> NugenClient:
    return NugenClient(NugenConfig.from_env())


def state_store() -> StateStore:
    return StateStore(STATE_PATH)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def status_from(payload: Any) -> str:
    if hasattr(payload, "status"):
        return str(payload.status)
    if isinstance(payload, dict):
        return str(payload.get("status", ""))
    return ""


def require_confirmation(value: bool, operation: str) -> None:
    if not value:
        raise SystemExit(f"Refusing to {operation} without the explicit confirmation flag")

