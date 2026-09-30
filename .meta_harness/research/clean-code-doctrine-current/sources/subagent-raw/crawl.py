import json,urllib.request,urllib.parse,time,sys,os
from email.utils import parsedate_to_datetime
base="https://api.fxtwitter.com/2/profile/unclebobmartin/statuses"
cursor=None; page=0; seen=set(); oldest=None; empty=0
while page<600:
    url=base+("?cursor="+urllib.parse.quote(cursor) if cursor else "")
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r:
                d=json.load(r); break
        except Exception as e:
            print("err",page,e,flush=True); time.sleep(5*(attempt+1)); d=None
    if not d: break
    res=d.get('results') or []
    json.dump(d,open(f"tl/p{page:04d}.json","w"))
    new=[t for t in res if t['id'] not in seen]
    for t in new: seen.add(t['id'])
    if res:
        dts=[parsedate_to_datetime(t['created_at']) for t in res if t.get('created_at')]
        oldest=min(dts) if dts else oldest
    print(page,len(res),len(new),oldest,flush=True)
    if not new: empty+=1
    else: empty=0
    if empty>=3: break
    if oldest and oldest.year<2025: break
    cursor=(d.get('cursor') or {}).get('bottom')
    if not cursor: break
    page+=1; time.sleep(1.0)
print("DONE",len(seen),oldest)
