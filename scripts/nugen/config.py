"""Environment-backed Nugen configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True, slots=True)
class NugenConfig:
    api_key: str
    base_url: str = "https://api.nugen.in"
    base_model: str | None = None
    aligned_model: str | None = None
    mock_mode: bool = True
    timeout_seconds: float = 30.0
    inference_timeout_seconds: float = 180.0

    @classmethod
    def from_env(cls, *, require_api_key: bool = True) -> NugenConfig:
        load_dotenv()
        api_key = os.getenv("NUGEN_API_KEY", "").strip()
        if require_api_key and not api_key:
            raise ValueError("NUGEN_API_KEY is required")
        return cls(
            api_key=api_key,
            base_url=os.getenv("NUGEN_BASE_URL", "https://api.nugen.in").rstrip("/"),
            base_model=os.getenv("NUGEN_BASE_MODEL") or None,
            aligned_model=os.getenv("NUGEN_ALIGNED_MODEL") or None,
            mock_mode=os.getenv("NUGEN_MOCK_MODE", "true").lower() in {"1", "true", "yes"},
            timeout_seconds=float(os.getenv("NUGEN_TIMEOUT_SECONDS", "30")),
            inference_timeout_seconds=float(
                os.getenv("NUGEN_INFERENCE_TIMEOUT_SECONDS", "180")
            ),
        )
