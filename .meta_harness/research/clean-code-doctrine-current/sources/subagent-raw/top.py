import json,glob,re,sys
from email.utils import parsedate_to_datetime
kw=re.compile(r'\b(AI|AIs|agent|agents|agentic|LLM|LLMs|grok|codex|claude|copilot|gpt|chatgpt|harness|harnesses|swarm|prompt|vibe|mutation|mutate|crap|gherkin|TDD|tokens?|opus|sonnet|fable|gemini)\b',re.I)
seen={}
for f in sorted(glob.glob('tl/p*.json')):
    for t in json.load(open(f)).get('results',[]): seen[t['id']]=t
rows=[]
for i,t in seen.items():
    if (t.get('author') or {}).get('screen_name','').lower()!='unclebobmartin': continue
    txt=t.get('text') or ''
    if not kw.search(txt): continue
    rows.append((t.get('views') or 0,parsedate_to_datetime(t['created_at']),i,t.get('replying_to'),txt))
rows.sort(key=lambda r:r[1])
lo,hi=int(sys.argv[1]),int(sys.argv[2])
for v,dt,i,rp,txt in rows[lo:hi]:
    print(f"{dt:%m-%d} {i} v{v} re:{rp} | {txt[:int(sys.argv[3])]}".replace('\n',' '))
print(len(rows),file=sys.stderr)
