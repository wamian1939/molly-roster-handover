"""Versioned agent-only rules. Keeps CP-SAT RuleSets and the Roster DB untouched."""
import json
import sqlite3
from datetime import date, datetime, time, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from engine.models import RuleSet, ExactStaffingBand


class RuleSettings(BaseModel):
    model_config=ConfigDict(extra='forbid')
    store_id:str
    scope:Literal['DEFAULT','WEEK']='DEFAULT'
    week_start:date|None=None
    expected_version:int=Field(ge=0)
    base_rule_version:str
    weekly:dict[int,list[ExactStaffingBand]]

    @model_validator(mode='after')
    def valid_week(self):
        if (self.scope=='WEEK')!=(self.week_start is not None) or (self.week_start and self.week_start.weekday()!=0):
            raise ValueError('本周规则需要指定周一；固定规则不指定日期')
        if set(self.weekly)!=set(range(7)):raise ValueError('请完整设置周一至周日')
        for bands in self.weekly.values():
            if not 1<=len(bands)<=48:raise ValueError('每天需要 1 至 48 个连续时段')
            previous=None
            for b in bands:
                start,end=time.fromisoformat(b.start),time.fromisoformat(b.end)
                if start>=end or any(t.tzinfo or t.minute%30 or t.second or t.microsecond for t in [start,end]):
                    raise ValueError('时段必须使用当天有效的半小时时间，结束晚于开始')
                if previous is not None and previous!=start:raise ValueError('同一天的覆盖时段必须连续，不能重叠或留空')
                previous=end
        return self


def connect(folder):
    folder.mkdir(parents=True,exist_ok=True)
    connection=sqlite3.connect(folder/'agent-rule-settings.sqlite3')
    connection.row_factory=sqlite3.Row
    connection.execute('''CREATE TABLE IF NOT EXISTS settings_versions (
        store_id TEXT NOT NULL, scope_key TEXT NOT NULL, version INTEGER NOT NULL,
        base_rule_version TEXT NOT NULL, weekly_json TEXT NOT NULL, saved_at TEXT NOT NULL,
        actor TEXT NOT NULL, PRIMARY KEY(store_id,scope_key,version))''')
    return connection


def latest(folder,store,key):
    if not (folder/'agent-rule-settings.sqlite3').is_file():return None
    with connect(folder) as db:
        row=db.execute('SELECT * FROM settings_versions WHERE store_id=? AND scope_key=? ORDER BY version DESC LIMIT 1',(store,key)).fetchone()
    return dict(row) if row else None


def effective(folder,base,week,allow_stale=False):
    if week.weekday()!=0:raise ValueError('排班周必须从周一开始')
    default=latest(folder,base.store_id,'DEFAULT')
    override=latest(folder,base.store_id,str(week))
    selected=override or default
    stale=bool(selected and selected['base_rule_version']!=base.version)
    if stale and not allow_stale:
        raise ValueError('基础门店规则已变化，请重新核对并保存智能体规则')
    if base.requirement_mode!='EXACT_SCHEDULED':raise ValueError('当前门店需先确认按时段精确覆盖的基础 RuleSet')
    if set(base.weekly_exact_staffing)!=set(range(7)):raise ValueError('基础 RuleSet 尚未完整配置周一至周日，请先核对门店规则')
    raw=base.model_dump(mode='json')
    if selected:
        raw['weekly_exact_staffing']=json.loads(selected['weekly_json'])
        raw['version']=f"{base.version}|agent:{selected['scope_key']}:v{selected['version']}"
    rules=RuleSet.model_validate(raw)
    return rules,{'store_id':base.store_id,'week_start':str(week),'base_rule_version':base.version,
        'effective_rule_version':rules.version,'default_version':default['version'] if default else 0,
        'needs_review':stale,
        'week_version':override['version'] if override else 0,'effective_scope':'WEEK' if override else 'DEFAULT',
        'default_weekly':json.loads(default['weekly_json']) if default else {str(k):[b.model_dump() for b in v] for k,v in base.weekly_exact_staffing.items()},
        'week_weekly':json.loads(override['weekly_json']) if override else None,
        'weekly':{str(k):[b.model_dump() for b in bands] for k,bands in rules.weekly_exact_staffing.items()}}


def save(folder,base,payload,actor):
    if payload.store_id!=base.store_id or payload.base_rule_version!=base.version:
        raise ValueError('门店或基础规则版本已变化，请重新读取')
    # Revalidate the complete effective RuleSet before persisting an override.
    raw=base.model_dump(mode='json');raw['weekly_exact_staffing']=payload.model_dump(mode='json')['weekly']
    RuleSet.model_validate(raw)
    key=str(payload.week_start) if payload.scope=='WEEK' else 'DEFAULT'
    with connect(folder) as db:
        db.execute('BEGIN IMMEDIATE')
        current=db.execute('SELECT MAX(version) FROM settings_versions WHERE store_id=? AND scope_key=?',(base.store_id,key)).fetchone()[0] or 0
        if current!=payload.expected_version:raise RuntimeError('规则已被其他人修改，请重新读取后保存')
        db.execute('INSERT INTO settings_versions VALUES (?,?,?,?,?,?,?)',(base.store_id,key,current+1,base.version,
            json.dumps(payload.model_dump(mode='json')['weekly']),datetime.now(timezone.utc).isoformat(),actor))
    return current+1
