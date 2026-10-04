"""#50 balance reconciliation: per-run balance delta vs streamed usage.cost, and the lag pattern."""
from decimal import Decimal as D
import json
import os
import sys

base = sys.argv[1]
runs = {
    "1": ("13340.756369759", "13340.841079759"),
    "2": ("13340.855102259", "13340.924684359"),
    "3": ("13340.940426359", "13340.986543849"),
}
tot_delta = D(0)
tot_rep = D(0)
for r in "123":
    d = os.path.join(base, f"live-{r}")
    files = sorted(f for f in os.listdir(d) if f.endswith(".json"))
    rs = [json.load(open(os.path.join(d, f))) for f in files]
    rep = sum((D(x["costUsd"]) for x in rs if x["costUsd"]), D(0))
    b, a = map(D, runs[r])
    delta = a - b
    tot_delta += delta
    tot_rep += rep
    rejected = [x["index"] for x in rs if x["outcome"] != "accepted"]
    print(f"run{r}: sent={len(rs)} rejected={rejected} reported={rep} delta={delta} delta-reported={delta - rep}")
    deficit = rep - delta
    s = D(0)
    for x in reversed(rs):
        if x["costUsd"]:
            s += D(x["costUsd"])
        if s == deficit:
            tail = [y["index"] for y in rs if y["index"] >= x["index"]]
            print(f"   deficit {deficit} == sum of reported costs of requests #{x['index']}..#{rs[-1]['index']} (startedAt {x['startedAt']}); tail indices {tail}")
            break
    else:
        print("   no suffix matches the deficit")
print("gap run1 after -> run2 before", D(runs["2"][0]) - D(runs["1"][1]))
print("gap run2 after -> run3 before", D(runs["3"][0]) - D(runs["2"][1]))
print("sum of per-run deltas", tot_delta)
print("sum of streamed usage.cost", tot_rep)
span = D(runs["3"][1]) - D(runs["1"][0])
print("span run1 before -> run3 after", span)
print("streamed minus span", tot_rep - span)
