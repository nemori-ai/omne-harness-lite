import json,glob,sys
from email.utils import parsedate_to_datetime
seen={}
for f in sorted(glob.glob('tl/p*.json')):
    for t in json.load(open(f)).get('results',[]): seen[t['id']]=t
for i in sys.argv[1:]:
    t=seen.get(i)
    if not t: print("MISSING",i); continue
    dt=parsedate_to_datetime(t['created_at'])
    print(f"### {dt:%Y-%m-%d %H:%M}Z {i} views={t.get('views')} re={t.get('replying_to')} note={t.get('is_note_tweet')}")
    print(t['text'])
    q=t.get('quote')
    if q: print(f"  [QUOTE @{(q.get('author') or {}).get('screen_name')} {q.get('url')}]: {(q.get('text') or '')[:500]}")
    m=t.get('media')
    if m and m.get('videos'): print("  [VIDEO]", m['videos'][0].get('duration'))
    print()
