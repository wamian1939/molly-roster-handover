from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from .models import ComplianceRules, OptimizationWeights


GLOBAL_BASE_FILE = Path(__file__).resolve().parents[1] / "configs" / "global-base.json"


class GlobalBase(BaseModel):
    version: str = Field(min_length=1)
    slot_minutes: Literal[15, 30, 60]
    compliance: ComplianceRules
    weights: OptimizationWeights
    solve_seconds: int = Field(ge=1, le=120)
    random_seed: int


def load_global_base() -> GlobalBase:
    """Read the Lab seed for new store drafts; saved store versions stay self-contained."""
    return GlobalBase.model_validate_json(GLOBAL_BASE_FILE.read_text(encoding="utf-8"))
