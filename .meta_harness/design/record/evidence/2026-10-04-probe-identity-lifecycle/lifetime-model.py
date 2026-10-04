"""Bounded transition exploration; abstract callback compliance, not a Cordis model."""
from collections import deque
import json
N=3
# registered, ready bits, jobs bits, stop, confirmed, opened, close index,
# closed bits, failed bits, report complete (0 pending/1 incomplete/2 complete)
initial=(0,0,0,False,False,False,-1,0,0,0)
def steps(s,mutation):
 n,r,j,stop,confirmed,opened,k,closed,failed,report=s
 if not stop and n<N:yield 'register-'+str(n),(n+1,r,j,stop,confirmed,opened,k,closed,failed,report)
 for i in range(n):
  bit=1<<i
  if not r&bit:yield 'setup-ready-'+str(i),(n,r|bit,j,stop,confirmed,opened,k,closed,failed,report)
  if confirmed and not stop and not j&bit:yield 'admit-'+str(i),(n,r,j|bit,stop,confirmed,opened,k,closed,failed,report)
  if j&bit:yield 'job-finished-'+str(i),(n,r,j&~bit,stop,confirmed,opened,k,closed,failed,report)
 if n==N and r==(1<<N)-1 and not confirmed and not stop:
  yield 'confirm-open',(n,r,j,stop,True,True,k,closed,failed,report)
 if not stop:
  yield 'stop',(n,r,j,True,confirmed,opened if mutation=='stale-gate' else False,n-1,closed,failed,report)
 if stop and k>=0:
  choices=[k] if mutation!='parallel-close' else list(range(n))
  for i in choices:
   bit=1<<i
   if closed&bit or not r&bit or j&bit:continue
   for bad in [False,True]:
    nc=closed|bit
    nk=max([x for x in range(n) if not nc&(1<<x)]+[-1])
    yield ('close-failed-' if bad else 'close-ok-')+str(i),(n,r,j,stop,confirmed,opened,nk,nc,failed|bit if bad else failed,report)
 if stop and k<0 and report==0:
  yield 'report',(n,r,j,stop,confirmed,opened,k,closed,failed,2 if not failed or mutation=='hide-errors' else 1)
def violation(s):
 n,r,j,stop,confirmed,opened,k,closed,failed,report=s
 if opened and (stop or not confirmed):return 'opening-not-current'
 for i in range(n):
  if closed&(1<<i) and any(j&(1<<c) for c in range(i,n)):
   return 'dependency-released-before-consumer'
 if report==2 and (failed or j or closed!=(1<<n)-1):return 'false-completion'
 return None
def explore(mutation):
 todo=deque([initial]);paths={initial:[]};edges=0
 while todo:
  s=todo.popleft()
  failure=violation(s)
  if failure:return {'mutation':mutation,'states':len(paths),'edges':edges,'violation':failure,'trace':paths[s],'state':s}
  for event,t in steps(s,mutation):
   edges+=1
   if t not in paths:paths[t]=paths[s]+[event];todo.append(t)
 return {'mutation':mutation,'states':len(paths),'edges':edges,'violation':None}
for mutation in ['valid','parallel-close','stale-gate','hide-errors']:
 result=explore(mutation)
 assert (result['violation'] is None)==(mutation=='valid'),result
 print(json.dumps(result))
