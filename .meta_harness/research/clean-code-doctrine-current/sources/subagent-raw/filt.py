import json,glob,re,sys
from email.utils import parsedate_to_datetime
kw=re.compile(r'\b(AI|A\.I\.|agent|agents|agentic|LLM|grok|codex|claude|copilot|gpt|chatgpt|openai|anthropic|gemini|model|models|harness|swarm|prompt|vibe|mutation|mutate|crap|gherkin|TDD|token|tokens|cursor|programmers?|clean code|coding)\b',re.I)
seen={}
for f in sorted(glob.glob('tl/p*.json')):
    d=json.load(open(f))
    for t in d.get('results',[]):
        seen[t['id']]=t
own=[];rts=[]
for i,t in seen.items():
    a=(t.get('author') or {}).get('screen_name','')
    txt=t.get('text') or ''
    q=t.get('quote') or {}
    full=txt+' '+(q.get('text') or '')
    if not kw.search(full): continue
    dt=parsedate_to_datetime(t['created_at'])
    (own if a.lower()=='unclebobmartin' else rts).append((dt,i,a,t.get('replying_to'),txt,q))
own.sort(); rts.sort()
mode=sys.argv[1] if len(sys.argv)>1 else 'own'
L=own if mode=='own' else rts
for dt,i,a,rp,txt,q in L:
    print(f"{dt:%Y-%m-%d} {i} @{a} re:{rp} | {txt[:int(sys.argv[2]) if len(sys.argv)>2 else 300]}".replace('\n',' '))
    if q: print(f"      QUOTE @{(q.get('author') or {}).get('screen_name')} {q.get('id')}: {(q.get('text') or '')[:200]}".replace('\n',' '))
print(len(seen),'total;',len(own),'own-AI;',len(rts),'rt-AI', file=sys.stderr)
