---- MODULE LoginLifetime_TTrace_1791138031 ----
EXTENDS LoginLifetime, Sequences, TLCExt, Toolbox, Naturals, TLC

_expression ==
    LET LoginLifetime_TEExpression == INSTANCE LoginLifetime_TEExpression
    IN LoginLifetime_TEExpression!expression
----

_trace ==
    LET LoginLifetime_TETrace == INSTANCE LoginLifetime_TETrace
    IN LoginLifetime_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        admittedAt = (1)
        /\
        phase = ("idle")
        /\
        effects = (1)
        /\
        expired = (TRUE)
        /\
        resultOK = (TRUE)
        /\
        now = (2)
        /\
        lastSuccess = (1)
    )
----

_init ==
    /\ now = _TETrace[1].now
    /\ admittedAt = _TETrace[1].admittedAt
    /\ lastSuccess = _TETrace[1].lastSuccess
    /\ expired = _TETrace[1].expired
    /\ effects = _TETrace[1].effects
    /\ phase = _TETrace[1].phase
    /\ resultOK = _TETrace[1].resultOK
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ now  = _TETrace[i].now
        /\ now' = _TETrace[j].now
        /\ admittedAt  = _TETrace[i].admittedAt
        /\ admittedAt' = _TETrace[j].admittedAt
        /\ lastSuccess  = _TETrace[i].lastSuccess
        /\ lastSuccess' = _TETrace[j].lastSuccess
        /\ expired  = _TETrace[i].expired
        /\ expired' = _TETrace[j].expired
        /\ effects  = _TETrace[i].effects
        /\ effects' = _TETrace[j].effects
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ resultOK  = _TETrace[i].resultOK
        /\ resultOK' = _TETrace[j].resultOK

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("LoginLifetime_TTrace_1791138031.json", _TETrace)

=============================================================================

 Note that you can extract this module `LoginLifetime_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `LoginLifetime_TEExpression.tla` file takes precedence 
  over the module `LoginLifetime_TEExpression` below).

---- MODULE LoginLifetime_TEExpression ----
EXTENDS LoginLifetime, Sequences, TLCExt, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `LoginLifetime` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        now |-> now
        ,admittedAt |-> admittedAt
        ,lastSuccess |-> lastSuccess
        ,expired |-> expired
        ,effects |-> effects
        ,phase |-> phase
        ,resultOK |-> resultOK
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_nowUnchanged |-> now = now'
        
        \* Format the `now` variable as Json value.
        \* ,_nowJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(now)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_nowModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].now # _TETrace[s-1].now
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE LoginLifetime_TETrace ----
\*EXTENDS LoginLifetime, IOUtils, TLC
\*
\*trace == IODeserialize("LoginLifetime_TTrace_1791138031.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE LoginLifetime_TETrace ----
EXTENDS LoginLifetime, TLC

trace == 
    <<
    ([admittedAt |-> 0,phase |-> "idle",effects |-> 0,expired |-> FALSE,resultOK |-> FALSE,now |-> 0,lastSuccess |-> 0]),
    ([admittedAt |-> 0,phase |-> "idle",effects |-> 0,expired |-> FALSE,resultOK |-> FALSE,now |-> 1,lastSuccess |-> 0]),
    ([admittedAt |-> 1,phase |-> "running",effects |-> 0,expired |-> FALSE,resultOK |-> FALSE,now |-> 1,lastSuccess |-> 0]),
    ([admittedAt |-> 1,phase |-> "running",effects |-> 0,expired |-> TRUE,resultOK |-> FALSE,now |-> 2,lastSuccess |-> 0]),
    ([admittedAt |-> 1,phase |-> "result",effects |-> 0,expired |-> TRUE,resultOK |-> TRUE,now |-> 2,lastSuccess |-> 0]),
    ([admittedAt |-> 1,phase |-> "idle",effects |-> 1,expired |-> TRUE,resultOK |-> TRUE,now |-> 2,lastSuccess |-> 1])
    >>
----


=============================================================================

---- CONFIG LoginLifetime_TTrace_1791138031 ----
CONSTANTS
    Idle = 2
    Absolute = 16
    MaxTime = 18
    BackfillAdmission = TRUE

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
\* Generated on Sun Oct 04 18:20:31 UTC 2026