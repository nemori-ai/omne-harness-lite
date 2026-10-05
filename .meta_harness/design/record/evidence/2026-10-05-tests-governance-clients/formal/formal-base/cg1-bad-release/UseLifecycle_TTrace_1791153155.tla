---- MODULE UseLifecycle_TTrace_1791153155 ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, UseLifecycle

_expression ==
    LET UseLifecycle_TEExpression == INSTANCE UseLifecycle_TEExpression
    IN UseLifecycle_TEExpression!expression
----

_trace ==
    LET UseLifecycle_TETrace == INSTANCE UseLifecycle_TETrace
    IN UseLifecycle_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        phase = (<<"settling", "idle">>)
        /\
        actor = (<<"original", "none">>)
        /\
        reported = (<<"none", "none">>)
        /\
        badAdmission = (FALSE)
        /\
        state = ("closed")
        /\
        remote = (<<"rejected", "none">>)
        /\
        selected = ("original")
        /\
        local = (<<"none", "none">>)
        /\
        released = (TRUE)
    )
----

_init ==
    /\ state = _TETrace[1].state
    /\ remote = _TETrace[1].remote
    /\ selected = _TETrace[1].selected
    /\ phase = _TETrace[1].phase
    /\ reported = _TETrace[1].reported
    /\ local = _TETrace[1].local
    /\ badAdmission = _TETrace[1].badAdmission
    /\ actor = _TETrace[1].actor
    /\ released = _TETrace[1].released
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ state  = _TETrace[i].state
        /\ state' = _TETrace[j].state
        /\ remote  = _TETrace[i].remote
        /\ remote' = _TETrace[j].remote
        /\ selected  = _TETrace[i].selected
        /\ selected' = _TETrace[j].selected
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ reported  = _TETrace[i].reported
        /\ reported' = _TETrace[j].reported
        /\ local  = _TETrace[i].local
        /\ local' = _TETrace[j].local
        /\ badAdmission  = _TETrace[i].badAdmission
        /\ badAdmission' = _TETrace[j].badAdmission
        /\ actor  = _TETrace[i].actor
        /\ actor' = _TETrace[j].actor
        /\ released  = _TETrace[i].released
        /\ released' = _TETrace[j].released

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("UseLifecycle_TTrace_1791153155.json", _TETrace)

=============================================================================

 Note that you can extract this module `UseLifecycle_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `UseLifecycle_TEExpression.tla` file takes precedence 
  over the module `UseLifecycle_TEExpression` below).

---- MODULE UseLifecycle_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, UseLifecycle

expression == 
    [
        \* To hide variables of the `UseLifecycle` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        state |-> state
        ,remote |-> remote
        ,selected |-> selected
        ,phase |-> phase
        ,reported |-> reported
        ,local |-> local
        ,badAdmission |-> badAdmission
        ,actor |-> actor
        ,released |-> released
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_stateUnchanged |-> state = state'
        
        \* Format the `state` variable as Json value.
        \* ,_stateJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(state)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_stateModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].state # _TETrace[s-1].state
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE UseLifecycle_TETrace ----
\*EXTENDS IOUtils, TLC, UseLifecycle
\*
\*trace == IODeserialize("UseLifecycle_TTrace_1791153155.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE UseLifecycle_TETrace ----
EXTENDS TLC, UseLifecycle

trace == 
    <<
    ([phase |-> <<"idle", "idle">>,actor |-> <<"none", "none">>,reported |-> <<"none", "none">>,badAdmission |-> FALSE,state |-> "open",remote |-> <<"none", "none">>,selected |-> "original",local |-> <<"none", "none">>,released |-> FALSE]),
    ([phase |-> <<"network", "idle">>,actor |-> <<"original", "none">>,reported |-> <<"none", "none">>,badAdmission |-> FALSE,state |-> "open",remote |-> <<"none", "none">>,selected |-> "original",local |-> <<"none", "none">>,released |-> FALSE]),
    ([phase |-> <<"network", "idle">>,actor |-> <<"original", "none">>,reported |-> <<"none", "none">>,badAdmission |-> FALSE,state |-> "closing",remote |-> <<"none", "none">>,selected |-> "original",local |-> <<"none", "none">>,released |-> FALSE]),
    ([phase |-> <<"settling", "idle">>,actor |-> <<"original", "none">>,reported |-> <<"none", "none">>,badAdmission |-> FALSE,state |-> "closing",remote |-> <<"rejected", "none">>,selected |-> "original",local |-> <<"none", "none">>,released |-> FALSE]),
    ([phase |-> <<"settling", "idle">>,actor |-> <<"original", "none">>,reported |-> <<"none", "none">>,badAdmission |-> FALSE,state |-> "closed",remote |-> <<"rejected", "none">>,selected |-> "original",local |-> <<"none", "none">>,released |-> TRUE])
    >>
----


=============================================================================

---- CONFIG UseLifecycle_TTrace_1791153155 ----
CONSTANTS
    Mutation = "early-dispose"

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
\* Generated on Sun Oct 04 22:32:36 UTC 2026