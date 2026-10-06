"""Algorithm probe only; simplified text blocks, not the product codec."""
from dataclasses import dataclass
import json, random
from pathlib import Path

@dataclass(frozen=True)
class Segment:
    values: tuple
    previous: object = None

class CacheOwner:
    def __init__(self):
        self.key=None; self.generation=None; self.entries=[]; self.blocks={}
        self.hidden=set(); self.segments=None; self.work=0
    def cold(self,entries,key,generation):
        self.key=key;self.generation=generation;self.entries=[];self.blocks={}
        self.hidden=set();self.segments=None;self.work=0
        for e in entries:
            self.work+=1
            if e['kind']=='message':
                if e['id'] in self.blocks:raise ValueError('duplicate')
                self.blocks[e['id']]=e
            elif e['kind']=='compact':
                for ref in e['hide']:
                    self.work+=1
                    if ref not in self.blocks:raise ValueError('bad reference')
                    self.hidden.add(ref)
            self.entries.append(e)
        for e in entries:
            self.work+=1
            if e['kind']=='message' and e.get('model') is True and e['id'] not in self.hidden:
                self.segments=Segment((e['id'],),self.segments)
        return self.segments
    def append(self,delta,key,generation):
        if key!=self.key or generation!=self.generation:
            return self.cold(self.entries+delta,key,generation),'invalidated'
        # Compaction can change arbitrary old blocks: use the linear fallback.
        if any(e['kind']=='compact' for e in delta):
            return self.cold(self.entries+delta,key,generation),'recomputed'
        self.work=0
        for e in delta:
            self.work+=1
            if e['kind']=='message':
                if e['id'] in self.blocks:raise ValueError('duplicate')
                self.blocks[e['id']]=e
                if e.get('model') is True:self.segments=Segment((e['id'],),self.segments)
            self.entries.append(e)
        return self.segments,'extended'

def flatten(segment):
    out=[]
    while segment is not None:
        out.extend(segment.values);segment=segment.previous
    return tuple(reversed(out))

# Independent small reference: intentionally scans the suffix for each block.
# Used only as an oracle, never as the scalable implementation.
def reference(entries):
    return tuple(e['id'] for i,e in enumerate(entries)
                 if e['kind']=='message' and e.get('model') is True
                 and not any(x['kind']=='compact' and e['id'] in x['hide'] for x in entries[i+1:]))

r=random.Random(6241); traces=0
for trial in range(80):
    owner=CacheOwner();owner.cold([],('rule1','external1'),'g1');all_entries=[];seen=[]
    for step in range(40):
        if seen and r.randrange(7)==0:
            e={'kind':'compact','hide':r.sample(seen,min(len(seen),r.randrange(1,4)))}
        elif r.randrange(3)==0:e={'kind':'fact','event':'attempt_started','id':f'f{step}'}
        else:
            e={'kind':'message','id':f'm{step}','model':r.choice([True,False,None])};seen.append(e['id'])
        old=owner.segments;old_value=flatten(old)
        result,mode=owner.append([e],('rule1','external1'),'g1');all_entries.append(e)
        assert flatten(result)==reference(all_entries)
        assert flatten(old)==old_value
        if mode=='extended' and result is not old:assert result.previous is old
        traces+=1
    for key,generation in [(('rule2','external1'),'g1'),(('rule2','external2'),'g1'),(('rule2','external2'),'g2')]:
        result,mode=owner.append([],key,generation)
        assert mode=='invalidated' and flatten(result)==reference(all_entries)

scales=[]
for n in [1000,2000,4000,8000]:
    entries=[{'kind':'message','id':str(i),'model':True} if i%3 else {'kind':'fact','event':'attempt_started'} for i in range(n)]
    c=CacheOwner();c.cold(entries,('r','e'),'g');cold=c.work
    prefix=c.segments;c.append([{'kind':'message','id':'tail','model':True}],('r','e'),'g')
    assert c.segments.previous is prefix and c.work==1 and cold==2*n
    scales.append({'N':n,'cold_visits':cold,'delta_visits':c.work,'materialized_items':len(flatten(c.segments))})

out={'scope':'simplified text-only algorithm/ownership probe; no product decoder/tool pairing/byte cost/public API proof',
     'traces_checked':traces,'seed':6241,'scales':scales,'immutable_prior_views':True,
     'future_implementation_obligations':['actual message schemas','tool/response pairing','bounded memory','concurrent cache publication','all external key dimensions','real serialized payload']}
Path('tmp/session-agent-runtime-phase1/evidence/design-completion/projection-probe.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out))
