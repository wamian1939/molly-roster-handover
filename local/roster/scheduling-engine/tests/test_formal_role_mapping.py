import pytest

from adapters.real import SourceReadError, map_historical_shift_roles


def test_historical_role_mapping_uses_active_formal_code_and_narrow_full_role_alias():
    jobs = [
        {"id": "job-service", "code": "service", "name": "服务", "isActive": True},
        {"id": "job-full", "code": "full-role", "name": "全岗", "isActive": True},
        {"id": "job-old", "code": "retired", "name": "旧岗位", "isActive": False},
    ]
    roles = [
        {"id": "role-service", "storeId": "hurstville", "code": "service", "nameZh": "服务"},
        {"id": "role-global", "storeId": None, "code": "service", "nameZh": "服务"},
        {"id": "role-full", "storeId": "hurstville", "code": "all-rounder", "nameZh": "全岗"},
        {"id": "role-wrong-name", "storeId": "hurstville", "code": "all-rounder", "nameZh": "前台"},
        {"id": "role-retired", "storeId": "hurstville", "code": "retired", "nameZh": "旧岗位"},
        {"id": "other-store", "storeId": "other", "code": "service", "nameZh": "服务"},
    ]
    mapped = map_historical_shift_roles(jobs, roles, "hurstville")
    assert mapped == {"role-service": "job-service", "role-global": "job-service",
        "role-full": "job-full", "role-wrong-name": None, "role-retired": None}


def test_legacy_alias_requires_both_canonical_job_and_roster_role_names():
    jobs = [{"id": "job-full", "code": "full-role", "name": "Different name", "isActive": True}]
    roles = [{"id": "role-full", "storeId": "hurstville", "code": "all-rounder", "nameZh": "全岗"}]
    assert map_historical_shift_roles(jobs, roles, "hurstville") == {"role-full": None}


def test_duplicate_active_formal_codes_fail_closed():
    jobs = [{"id": "first", "code": "service", "name": "服务", "isActive": True},
            {"id": "second", "code": "service", "name": "服务", "isActive": True}]
    with pytest.raises(SourceReadError, match="multiple active formal jobs"):
        map_historical_shift_roles(jobs, [], "hurstville")
