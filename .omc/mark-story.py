import json, io, sys, datetime
sid = "bfba9426-887b-4adc-9e78-aa59e1fef2d1"
p = f".omc/state/sessions/{sid}/prd.json"
story_id, note = sys.argv[1], sys.argv[2]
d = json.load(io.open(p, encoding="utf-8"))
found = False
for s in d["stories"]:
    if s["id"] == story_id:
        s["passes"] = True
        s["completionCriteriaRevision"] = s["governingCriteriaRevision"]
        s["notes"] = note
        s["completedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        found = True
assert found, f"{story_id} not found"
json.dump(d, io.open(p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=2)
print(f"{story_id} -> passes: true")
