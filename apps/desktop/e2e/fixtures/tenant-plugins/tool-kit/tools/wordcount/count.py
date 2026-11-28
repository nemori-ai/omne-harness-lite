import json, sys
print(len(json.load(sys.stdin)["text"].split()))
