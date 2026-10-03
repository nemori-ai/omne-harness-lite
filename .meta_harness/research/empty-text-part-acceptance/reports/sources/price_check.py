"""Compare each accepted request's streamed usage.cost with the registered unit prices in probe.mjs."""
from decimal import Decimal as D
import json
import os
import sys

base = sys.argv[1]
prices = {}
for line in open(os.path.join(base, "a.txt")):
    route, provider, p, c = line.strip().split(",")
    prices[route] = (D(p), D(c))
for run in "123":
    d = os.path.join(base, f"live-{run}")
    for f in sorted(x for x in os.listdir(d) if x.endswith(".json")):
        r = json.load(open(os.path.join(d, f)))
        if r["outcome"] != "accepted":
            continue
        u = r["usage"]
        p, c = prices[r["route"]]
        cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
        expect = p * u["prompt_tokens"] + c * u["completion_tokens"]
        actual = D(r["costUsd"])
        cd = u.get("cost_details") or {}
        mark = "match" if expect == actual else "DIFF"
        print(f"{run}#{r['index']:>2} {r['route']:<30} {r['variant']:<2} pt={u['prompt_tokens']:>5} cached={cached:>5} ct={u['completion_tokens']:>5} "
              f"registered={expect} reported={actual} {mark} prompt_cost={cd.get('upstream_inference_prompt_cost')} completion_cost={cd.get('upstream_inference_completions_cost')}")
