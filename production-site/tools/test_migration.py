import copy
import json
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import closing

from data import digest, import_local
from schema import generate, models


def sample():
    timestamp = "2026-10-24T00:00:00.000Z"
    period = dict(id="p", storeId="hurstville", startDate="2026-10-26", endDate="2026-11-01", cycleType="WEEK", status="PUBLISHED", version=2, createdByAccountId="a", createdAt=timestamp, updatedAt=timestamp, publishedAt=timestamp)
    role = dict(id="r",storeId=None,code="service",nameZh="Service",colorToken="#123abc",requiredSkillCodes=["one"],isActive=True,displayOrder=0,version=1,createdAt=timestamp,updatedAt=timestamp)
    shift = dict(id="s",rosterPeriodId="p",storeId="hurstville",date="2026-10-26",startAt="2026-10-25T23:00:00.000Z",endAt="2026-10-26T06:00:00.000Z",breakMinutes=30,shiftRoleId="r",roleNameSnapshot="Service",roleColorSnapshot="#123abc",publicNote=None,internalNote="manager",version=1,createdByAccountId="a",updatedByAccountId="a",createdAt=timestamp,updatedAt=timestamp)
    publication = dict(id="pub",rosterPeriodId="p",periodVersion=2,publishedByAccountId="a",publishedAt=timestamp,snapshot={"schemaVersion":1,"timezone":"Australia/Sydney","period":period,"shifts":[shift]})
    tables = {m["table"]:[] for m in models()[0]}
    tables.update(roster_periods=[period],shift_roles=[role],shifts=[shift],roster_publications=[publication])
    return {"format":1,"source":"roster","tables":tables,"contentHash":digest(tables)}


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = pathlib.Path(self.temp.name)/"test.sqlite"

    def tearDown(self): self.temp.cleanup()

    def test_schema_has_every_model_and_foreign_key(self):
        con = sqlite3.connect(":memory:")
        con.executescript(generate())
        self.assertEqual(len(models()[0]),12)
        self.assertEqual(len(con.execute("PRAGMA foreign_key_list(shifts)").fetchall()),3)
        con.close()

    def test_roundtrip_repeat_preserves_publication_dates_and_json(self):
        payload = sample()
        self.assertEqual(import_local(payload,self.database)["inserted"],4)
        repeated = import_local(payload,self.database)
        self.assertEqual((repeated["inserted"],repeated["unchanged"]),(0,4))
        with closing(sqlite3.connect(self.database)) as con:
            self.assertEqual(con.execute('SELECT startAt FROM shifts').fetchone()[0],"2026-10-25T23:00:00.000Z")
            self.assertEqual(json.loads(con.execute('SELECT snapshot FROM roster_publications').fetchone()[0]),payload["tables"]["roster_publications"][0]["snapshot"])

    def test_changed_target_rolls_back_all_import_rows(self):
        payload = sample()
        import_local(payload,self.database)
        changed = copy.deepcopy(payload)
        new = {**changed["tables"]["roster_periods"][0],"id":"p2","storeId":"new-store"}
        changed["tables"]["roster_periods"].insert(0,new)
        changed["tables"]["shift_roles"][0]["nameZh"] = "changed"
        changed["contentHash"] = digest(changed["tables"])
        with self.assertRaisesRegex(ValueError,"Target row differs"): import_local(changed,self.database)
        with closing(sqlite3.connect(self.database)) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM roster_periods').fetchone()[0],1)

    def test_cross_store_foreign_key_aborts(self):
        payload = sample()
        payload["tables"]["shifts"][0]["storeId"]="other"
        payload["contentHash"] = digest(payload["tables"])
        with self.assertRaises(sqlite3.IntegrityError): import_local(payload,self.database)

    def test_overlap_exclusion_aborts(self):
        payload=sample()
        payload["tables"]["roster_periods"].append({**payload["tables"]["roster_periods"][0],"id":"p2","startDate":"2026-11-01","endDate":"2026-11-07"})
        payload["contentHash"]=digest(payload["tables"])
        with self.assertRaisesRegex(sqlite3.IntegrityError,"ROSTER_PERIOD_OVERLAP"): import_local(payload,self.database)

    def test_checksum_rejects_modified_export(self):
        payload=sample(); payload["tables"]["shifts"].clear()
        with self.assertRaisesRegex(ValueError,"checksum"): import_local(payload,self.database)


if __name__ == "__main__": unittest.main()
