#!/bin/bash
# usage: fx.sh ID...
for id in "$@"; do
  f=tw_$id.json
  [ -s $f ] || curl -sS -m 25 "https://api.fxtwitter.com/unclebobmartin/status/$id" > $f
  python3 - "$f" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
t=d.get('tweet') or {}
print("ID",t.get('id'),"|",t.get('created_at'),"|@"+(t.get('author') or {}).get('screen_name',''),"| reply_to:",t.get('replying_to'),t.get('replying_to_status'),"| views",t.get('views'))
print(t.get('text'))
q=t.get('quote')
if q: print("  [QUOTE @%s %s %s]: %s"%(q.get('author',{}).get('screen_name'),q.get('id'),q.get('created_at'),q.get('text')))
m=t.get('media')
if m: print("  [MEDIA]", json.dumps(m)[:400])
if d.get('code')!=200: print("  CODE",d.get('code'),d.get('message'))
print("-----")
PY
done
