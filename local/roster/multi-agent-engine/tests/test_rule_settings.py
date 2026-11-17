from datetime import timedelta
import pytest
from pydantic import ValidationError
from multi_agent.rule_settings import RuleSettings,save,effective
from test_engine import engine,MON


def payload(e,**updates):
    return RuleSettings.model_validate({'store_id':e.rules.store_id,'expected_version':0,'base_rule_version':e.rules.version,
        'scope':'DEFAULT','weekly':{str(k):[b.model_dump() for b in v] for k,v in e.rules.weekly_exact_staffing.items()},**updates})


def test_defaults_and_week_overrides_are_versioned_without_changing_cp_sat_rules(tmp_path):
    e=engine(7);original=e.rules.model_dump_json()
    p=payload(e);p.weekly[0][1].staff=5
    assert save(tmp_path,e.rules,p,'actor')==1
    resolved,view=effective(tmp_path,e.rules,MON)
    assert resolved.weekly_exact_staffing[0][1].staff==5
    assert '|agent:DEFAULT:v1' in resolved.version
    assert e.rules.model_dump_json()==original
    weekly=p.model_copy(deep=True,update={'scope':'WEEK','week_start':MON,'expected_version':0})
    weekly.weekly[0][1].staff=6
    save(tmp_path,e.rules,weekly,'actor')
    assert effective(tmp_path,e.rules,MON)[0].weekly_exact_staffing[0][1].staff==6
    assert effective(tmp_path,e.rules,MON+timedelta(days=7))[0].weekly_exact_staffing[0][1].staff==5
    assert view['default_version']==1
    with pytest.raises(RuntimeError):save(tmp_path,e.rules,p,'other-actor')
    changed=e.rules.model_copy(update={'version':'new-base'})
    with pytest.raises(ValueError):effective(tmp_path,changed,MON)
    assert effective(tmp_path,changed,MON,allow_stale=True)[1]['needs_review'] is True


def test_rule_gaps_overlap_and_invalid_scopes_are_rejected():
    e=engine(7);raw=payload(e).model_dump(mode='json')
    raw['weekly']['0'][1]['start']='11:30'
    with pytest.raises(ValidationError):RuleSettings.model_validate(raw)
    raw=payload(e).model_dump(mode='json');raw['weekly']['0'][0]['start']='10:15'
    with pytest.raises(ValidationError):RuleSettings.model_validate(raw)
    with pytest.raises(ValidationError):payload(e,scope='WEEK',week_start=MON+timedelta(days=1))


def test_stale_base_version_and_other_store_cannot_be_saved(tmp_path):
    e=engine(7)
    with pytest.raises(ValueError):save(tmp_path,e.rules,payload(e,store_id='another-store'),'actor')
    with pytest.raises(ValueError):save(tmp_path,e.rules,payload(e,base_rule_version='stale'),'actor')
