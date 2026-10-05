---- MODULE TuiDelivery_TTrace_1791155394 ----
EXTENDS TuiDelivery, Sequences, TLCExt, Toolbox, Naturals, TLC

_expression ==
    LET TuiDelivery_TEExpression == INSTANCE TuiDelivery_TEExpression
    IN TuiDelivery_TEExpression!expression
----

_trace ==
    LET TuiDelivery_TETrace == INSTANCE TuiDelivery_TETrace
    IN TuiDelivery_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        phase = ("closing")
        /\
        flight = (0)
        /\
        visible = (2)
        /\
        lateWrite = (FALSE)
        /\
        pending = (2)
        /\
        cgQuiet = (TRUE)
        /\
        targetCount = (0)
        /\
        revision = (0)
        /\
        localClosed = (FALSE)
        /\
        actualWrite = (TRUE)
        /\
        admittedInvisible = (FALSE)
        /\
        restored = (TRUE)
        /\
        inputDone = (TRUE)
        /\
        workDone = (TRUE)
    )
----

_init ==
    /\ pending = _TETrace[1].pending
    /\ revision = _TETrace[1].revision
    /\ inputDone = _TETrace[1].inputDone
    /\ cgQuiet = _TETrace[1].cgQuiet
    /\ lateWrite = _TETrace[1].lateWrite
    /\ targetCount = _TETrace[1].targetCount
    /\ restored = _TETrace[1].restored
    /\ admittedInvisible = _TETrace[1].admittedInvisible
    /\ flight = _TETrace[1].flight
    /\ phase = _TETrace[1].phase
    /\ visible = _TETrace[1].visible
    /\ localClosed = _TETrace[1].localClosed
    /\ workDone = _TETrace[1].workDone
    /\ actualWrite = _TETrace[1].actualWrite
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ pending  = _TETrace[i].pending
        /\ pending' = _TETrace[j].pending
        /\ revision  = _TETrace[i].revision
        /\ revision' = _TETrace[j].revision
        /\ inputDone  = _TETrace[i].inputDone
        /\ inputDone' = _TETrace[j].inputDone
        /\ cgQuiet  = _TETrace[i].cgQuiet
        /\ cgQuiet' = _TETrace[j].cgQuiet
        /\ lateWrite  = _TETrace[i].lateWrite
        /\ lateWrite' = _TETrace[j].lateWrite
        /\ targetCount  = _TETrace[i].targetCount
        /\ targetCount' = _TETrace[j].targetCount
        /\ restored  = _TETrace[i].restored
        /\ restored' = _TETrace[j].restored
        /\ admittedInvisible  = _TETrace[i].admittedInvisible
        /\ admittedInvisible' = _TETrace[j].admittedInvisible
        /\ flight  = _TETrace[i].flight
        /\ flight' = _TETrace[j].flight
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ visible  = _TETrace[i].visible
        /\ visible' = _TETrace[j].visible
        /\ localClosed  = _TETrace[i].localClosed
        /\ localClosed' = _TETrace[j].localClosed
        /\ workDone  = _TETrace[i].workDone
        /\ workDone' = _TETrace[j].workDone
        /\ actualWrite  = _TETrace[i].actualWrite
        /\ actualWrite' = _TETrace[j].actualWrite

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("TuiDelivery_TTrace_1791155394.json", _TETrace)

=============================================================================

 Note that you can extract this module `TuiDelivery_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `TuiDelivery_TEExpression.tla` file takes precedence 
  over the module `TuiDelivery_TEExpression` below).

---- MODULE TuiDelivery_TEExpression ----
EXTENDS TuiDelivery, Sequences, TLCExt, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `TuiDelivery` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        pending |-> pending
        ,revision |-> revision
        ,inputDone |-> inputDone
        ,cgQuiet |-> cgQuiet
        ,lateWrite |-> lateWrite
        ,targetCount |-> targetCount
        ,restored |-> restored
        ,admittedInvisible |-> admittedInvisible
        ,flight |-> flight
        ,phase |-> phase
        ,visible |-> visible
        ,localClosed |-> localClosed
        ,workDone |-> workDone
        ,actualWrite |-> actualWrite
        
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
\*---- MODULE TuiDelivery_TETrace ----
\*EXTENDS TuiDelivery, IOUtils, TLC
\*
\*trace == IODeserialize("TuiDelivery_TTrace_1791155394.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE TuiDelivery_TETrace ----
EXTENDS TuiDelivery, TLC

trace == 
    <<
    ([phase |-> "editing",flight |-> 2,visible |-> 2,lateWrite |-> FALSE,pending |-> 2,cgQuiet |-> FALSE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> FALSE,admittedInvisible |-> FALSE,restored |-> FALSE,inputDone |-> TRUE,workDone |-> TRUE]),
    ([phase |-> "preview",flight |-> 2,visible |-> 2,lateWrite |-> FALSE,pending |-> 0,cgQuiet |-> FALSE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> FALSE,admittedInvisible |-> FALSE,restored |-> FALSE,inputDone |-> TRUE,workDone |-> TRUE]),
    ([phase |-> "preview",flight |-> 0,visible |-> 2,lateWrite |-> FALSE,pending |-> 2,cgQuiet |-> FALSE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> TRUE,admittedInvisible |-> FALSE,restored |-> FALSE,inputDone |-> TRUE,workDone |-> TRUE]),
    ([phase |-> "closing",flight |-> 0,visible |-> 2,lateWrite |-> FALSE,pending |-> 2,cgQuiet |-> FALSE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> TRUE,admittedInvisible |-> FALSE,restored |-> FALSE,inputDone |-> TRUE,workDone |-> TRUE]),
    ([phase |-> "closing",flight |-> 0,visible |-> 2,lateWrite |-> FALSE,pending |-> 2,cgQuiet |-> TRUE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> TRUE,admittedInvisible |-> FALSE,restored |-> FALSE,inputDone |-> TRUE,workDone |-> TRUE]),
    ([phase |-> "closing",flight |-> 0,visible |-> 2,lateWrite |-> FALSE,pending |-> 2,cgQuiet |-> TRUE,targetCount |-> 0,revision |-> 0,localClosed |-> FALSE,actualWrite |-> TRUE,admittedInvisible |-> FALSE,restored |-> TRUE,inputDone |-> TRUE,workDone |-> TRUE])
    >>
----


=============================================================================

---- CONFIG TuiDelivery_TTrace_1791155394 ----
CONSTANTS
    BadConfirm = FALSE
    BadOutputRestore = TRUE
    BadInputRestore = FALSE
    BadRelease = FALSE
    BadLateWrite = FALSE

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
\* Generated on Sun Oct 04 23:09:55 UTC 2026