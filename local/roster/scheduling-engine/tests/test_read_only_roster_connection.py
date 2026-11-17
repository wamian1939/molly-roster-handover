import pytest

from adapters import real


def test_roster_source_prefers_restricted_url_and_requests_read_only_session(monkeypatch):
    calls = []
    sentinel = object()
    monkeypatch.setenv("ROSTER_DATABASE_READONLY_URL", "postgresql://reader@localhost/roster")
    monkeypatch.setenv("ROSTER_DATABASE_URL", "postgresql://writer@localhost/roster")
    monkeypatch.setattr(real.psycopg, "connect", lambda *args, **kwargs: calls.append((args, kwargs)) or sentinel)

    assert real._roster_connection() is sentinel
    assert calls == [(("postgresql://reader@localhost/roster",), {
        "connect_timeout": 5,
        "row_factory": real.dict_row,
        "options": "-c default_transaction_read_only=on",
    })]


def test_roster_source_rejects_backend_writer_fallback(monkeypatch):
    calls = []
    monkeypatch.delenv("ROSTER_DATABASE_READONLY_URL", raising=False)
    monkeypatch.setenv("ROSTER_DATABASE_URL", "postgresql://writer@localhost/roster")
    monkeypatch.setattr(real.psycopg, "connect", lambda *args, **kwargs: calls.append((args, kwargs)))

    with pytest.raises(real.SourceReadError, match="ROSTER_DATABASE_READONLY_URL"):
        real._roster_connection()
    assert calls == []
