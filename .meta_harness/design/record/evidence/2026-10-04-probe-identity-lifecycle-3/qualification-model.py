# Bounded safety enumeration. This does not model Cordis scheduling or prove progress.
from collections import deque
import json
# state: stopped, listener, cached_open, registration_step, requested_step, entry_drained
initial = (False, True, True, 1, 1, False)
def verify(shared_gate, immediate_registration):
    seen={initial}; todo=deque([(initial, [])]); edges=0
    while todo:
        s, trace=todo.popleft(); stopped, listener, cached, step, requested, drained=s
        actions=[]
        if listener: actions.append(('remove-listener',(stopped,False,cached,step,requested,drained)))
        if not stopped: actions.append(('stop',(True,listener,False if listener else cached,step,requested,drained)))
        allow=cached and (not stopped if shared_gate else True)
        if stopped and allow:
            return {'safe':False,'states':len(seen),'edges':edges,'counterexample':trace+['new-network-admission']}
        if step<3 and (not stopped if immediate_registration else not drained):
            nxt=(stopped,listener,cached,step+1,requested+1,drained)
            if stopped:
                return {'safe':False,'states':len(seen),'edges':edges+1,'counterexample':trace+['late-step-starts-next']}
            actions.append(('step-complete',nxt))
        if stopped and not drained: actions.append(('entry-drained',(stopped,listener,cached,step,requested,True)))
        for action,nxt in actions:
            edges+=1
            if nxt not in seen: seen.add(nxt);todo.append((nxt,trace+[action]))
    return {'safe':True,'states':len(seen),'edges':edges}
for name,gate,registration,expected in [('qualified',True,True,True),('listener-only',False,True,False),('late-registration-close',True,False,False)]:
    result=verify(gate,registration);assert result['safe']==expected
    print(json.dumps(dict(case=name,**result),sort_keys=True))
