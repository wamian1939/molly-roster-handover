"""Isolated draft-only multi-agent scheduler. No solver imports or Roster writes."""
import sys
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parents[2] / "scheduling-engine"
if str(LAB_ROOT) not in sys.path:
    sys.path.insert(0, str(LAB_ROOT))
