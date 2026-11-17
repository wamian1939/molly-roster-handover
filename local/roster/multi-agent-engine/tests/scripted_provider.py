"""Explicit unit-test double. Not an LLM, not available through the application API."""
class ScriptedProvider:
    name="SCRIPTED_TEST_DOUBLE_NOT_LLM"
    def __init__(self):
        self.payloads=[]
    def generate(self,agent,payload,schema):
        self.payloads.append((agent,payload))
        if agent=="requirement":
            result={**payload["authoritative_context"],"priorities":["Official rating and cumulative hours"]}
        elif agent=="daily":
            choices=[]
            used={s["employee_id"] for s in payload["locked_shifts"]}
            priority={r["employee_id"]:r for r in payload["ledger"]["employees"]}
            # A fixed scenario transcript template for exact Hurstville fixtures.
            for name,count in [("Full",3),("Early",payload["day"]["coverage"][1]["staff"]-3),
                               ("Late",payload["day"]["coverage"][2]["staff"]-3)]:
                candidates=sorted((c for c in payload["candidates"] if c["pattern_name"]==name
                    and (name!="Late" or c["local_start"]=="17:00")), key=lambda c:(-priority[c["employee_id"]]["priority"],c["id"]))
                for _ in range(count):
                    c=next((c for c in candidates if c["employee_id"] not in used),None)
                    if c is None:
                        break
                    used.add(c["employee_id"])
                    row=priority[c["employee_id"]]
                    choices.append({"candidate_id":c["id"],"reason":f"Test transcript: rating {row['rating']}, priority {row['priority']}"})
            result={"date":payload["date"],"ledger_version":payload["ledger"]["version"],
                    "choices":choices,"explanation":"Scripted synthetic fixture, not an LLM result"}
        elif agent=="review":
            result={"unassigned_employee_ids":payload["unassigned_employee_ids"],
                    "low_hours_employee_ids":payload["low_hours_employee_ids"],"analysis":"Test review",
                    "replacements":[],"retain_reasons":["Retain validated fixture"]}
        else:
            result={"approved_replacement_indices":[],"actions":[],"analysis":"Test audit"}
        return result,{"input_tokens":0,"output_tokens":0,"cost_usd":0,"model":"TEST_DOUBLE"}
