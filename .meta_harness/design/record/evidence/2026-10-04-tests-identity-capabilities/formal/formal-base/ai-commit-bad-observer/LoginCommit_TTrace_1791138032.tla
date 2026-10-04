---- MODULE LoginCommit_TTrace_1791138032 ----
EXTENDS Sequences, LoginCommit, TLCExt, Toolbox, Naturals, TLC

_expression ==
    LET LoginCommit_TEExpression == INSTANCE LoginCommit_TEExpression
    IN LoginCommit_TEExpression!expression
----

_trace ==
    LET LoginCommit_TETrace == INSTANCE LoginCommit_TETrace
    IN LoginCommit_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        phase = ("idle")
        /\
        effects = (1)
        /\
        pendingEffect = (1)
        /\
        pending = (1)
        /\
        now = (2)
        /\
        lastSuccess = (1)
        /\
        observedExpired = (TRUE)
    )
----

_init ==
    /\ pending = _TETrace[1].pending
    /\ now = _TETrace[1].now
    /\ lastSuccess = _TETrace[1].lastSuccess
    /\ effects = _TETrace[1].effects
    /\ phase = _TETrace[1].phase
    /\ pendingEffect = _TETrace[1].pendingEffect
    /\ observedExpired = _TETrace[1].observedExpired
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ pending  = _TETrace[i].pending
        /\ pending' = _TETrace[j].pending
        /\ now  = _TETrace[i].now
        /\ now' = _TETrace[j].now
        /\ lastSuccess  = _TETrace[i].lastSuccess
        /\ lastSuccess' = _TETrace[j].lastSuccess
        /\ effects  = _TETrace[i].effects
        /\ effects' = _TETrace[j].effects
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ pendingEffect  = _TETrace[i].pendingEffect
        /\ pendingEffect' = _TETrace[j].pendingEffect
        /\ observedExpired  = _TETrace[i].observedExpired
        /\ observedExpired' = _TETrace[j].observedExpired

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("LoginCommit_TTrace_1791138032.json", _TETrace)

=============================================================================

 Note that you can extract this module `LoginCommit_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `LoginCommit_TEExpression.tla` file takes precedence 
  over the module `LoginCommit_TEExpression` below).

---- MODULE LoginCommit_TEExpression ----
EXTENDS Sequences, LoginCommit, TLCExt, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `LoginCommit` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        pending |-> pending
        ,now |-> now
        ,lastSuccess |-> lastSuccess
        ,effects |-> effects
        ,phase |-> phase
        ,pendingEffect |-> pendingEffect
        ,observedExpired |-> observedExpired
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_pendingUnchanged |-> pending = pending'
        
        \* Format the `pending` variable as Json value.
        \* ,_pendingJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(pending)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_pendingModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].pending # _TETrace[s-1].pending
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE LoginCommit_TETrace ----
\*EXTENDS IOUtils, LoginCommit, TLC
\*
\*trace == IODeserialize("LoginCommit_TTrace_1791138032.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE LoginCommit_TETrace ----
EXTENDS LoginCommit, TLC

trace == 
    <<
    ([phase |-> "idle",effects |-> 0,pendingEffect |-> 0,pending |-> 0,now |-> 0,lastSuccess |-> 0,observedExpired |-> FALSE]),
    ([phase |-> "idle",effects |-> 0,pendingEffect |-> 0,pending |-> 0,now |-> 1,lastSuccess |-> 0,observedExpired |-> FALSE]),
    ([phase |-> "running",effects |-> 0,pendingEffect |-> 0,pending |-> 0,now |-> 1,lastSuccess |-> 0,observedExpired |-> FALSE]),
    ([phase |-> "staged",effects |-> 0,pendingEffect |-> 1,pending |-> 1,now |-> 1,lastSuccess |-> 0,observedExpired |-> FALSE]),
    ([phase |-> "staged",effects |-> 0,pendingEffect |-> 1,pending |-> 1,now |-> 2,lastSuccess |-> 0,observedExpired |-> FALSE]),
    ([phase |-> "staged",effects |-> 0,pendingEffect |-> 1,pending |-> 1,now |-> 2,lastSuccess |-> 0,observedExpired |-> TRUE]),
    ([phase |-> "idle",effects |-> 1,pendingEffect |-> 1,pending |-> 1,now |-> 2,lastSuccess |-> 1,observedExpired |-> TRUE])
    >>
----


=============================================================================

---- CONFIG LoginCommit_TTrace_1791138032 ----
CONSTANTS
    Idle = 2
    Absolute = 16
    MaxTime = 18
    ProtectObservers = FALSE

INVARIANT
    _inv

CHECK_DEADLOCK
    \* CHECK_DEADLOCK off because of PROPERTY or INVARIANT above.
    FALSE

INIT
    _init

NEXT
    _next

CONSTANT
    _TETrace <- _trace

ALIAS
    _expression
=============================================================================
\* Generated on Sun Oct 04 18:20:33 UTC 2026