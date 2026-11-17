from __future__ import annotations

import json

from fastapi.testclient import TestClient

from api import storage
from api.app import app
from engine import global_base


def test_global_seed_is_versioned_and_saved_store_rule_is_frozen(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    seed_path = tmp_path / "global-base.json"
    seed = global_base.load_global_base().model_dump(mode="json")
    seed_path.write_text(json.dumps(seed), encoding="utf-8")
    monkeypatch.setattr(global_base, "GLOBAL_BASE_FILE", seed_path)

    client = TestClient(app)
    draft = client.get("/api/rules/mock-original").json()
    assert draft["global_base_version"] == seed["version"]
    assert draft["weights"]["fairness"] == seed["weights"]["fairness"]
    saved = client.post("/api/rules/mock-original", json=draft)
    assert saved.status_code == 200

    changed = json.loads(seed_path.read_text(encoding="utf-8"))
    changed["version"] = "lab-global-base-v2"
    changed["weights"]["fairness"] = 7
    seed_path.write_text(json.dumps(changed), encoding="utf-8")
    new_draft = client.get("/api/rules/mock-new").json()
    assert new_draft["global_base_version"] == "lab-global-base-v2"
    assert new_draft["weights"]["fairness"] == 7

    historical = client.get("/api/rules/mock-original/versions/1").json()
    assert historical["global_base_version"] == seed["version"]
    assert historical["weights"]["fairness"] == seed["weights"]["fairness"]
    assert client.get("/api/rules/mock-original").json() == historical
