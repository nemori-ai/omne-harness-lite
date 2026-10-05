---- MODULE TerminalExit_TTrace_1791155391 ----
EXTENDS Sequences, TLCExt, TerminalExit, Toolbox, Naturals, TLC

_expression ==
    LET TerminalExit_TEExpression == INSTANCE TerminalExit_TEExpression
    IN TerminalExit_TEExpression!expression
----

_trace ==
    LET TerminalExit_TETrace == INSTANCE TerminalExit_TETrace
    IN TerminalExit_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        outputs = (0)
        /\
        phase = ("input")
        /\
        cgClosed = (FALSE)
        /\
        rawAtInvoke = (FALSE)
        /\
        pasteStarted = (TRUE)
        /\
        stopping = (TRUE)
        /\
        localReleased = (FALSE)
        /\
        raw = (FALSE)
        /\
        inputDone = (FALSE)
        /\
        pasteOpen = (TRUE)
        /\
        workDone = (TRUE)
    )
----

_init ==
    /\ inputDone = _TETrace[1].inputDone
    /\ pasteOpen = _TETrace[1].pasteOpen
    /\ pasteStarted = _TETrace[1].pasteStarted
    /\ stopping = _TETrace[1].stopping
    /\ outputs = _TETrace[1].outputs
    /\ phase = _TETrace[1].phase
    /\ cgClosed = _TETrace[1].cgClosed
    /\ localReleased = _TETrace[1].localReleased
    /\ workDone = _TETrace[1].workDone
    /\ rawAtInvoke = _TETrace[1].rawAtInvoke
    /\ raw = _TETrace[1].raw
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ inputDone  = _TETrace[i].inputDone
        /\ inputDone' = _TETrace[j].inputDone
        /\ pasteOpen  = _TETrace[i].pasteOpen
        /\ pasteOpen' = _TETrace[j].pasteOpen
        /\ pasteStarted  = _TETrace[i].pasteStarted
        /\ pasteStarted' = _TETrace[j].pasteStarted
        /\ stopping  = _TETrace[i].stopping
        /\ stopping' = _TETrace[j].stopping
        /\ outputs  = _TETrace[i].outputs
        /\ outputs' = _TETrace[j].outputs
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ cgClosed  = _TETrace[i].cgClosed
        /\ cgClosed' = _TETrace[j].cgClosed
        /\ localReleased  = _TETrace[i].localReleased
        /\ localReleased' = _TETrace[j].localReleased
        /\ workDone  = _TETrace[i].workDone
        /\ workDone' = _TETrace[j].workDone
        /\ rawAtInvoke  = _TETrace[i].rawAtInvoke
        /\ rawAtInvoke' = _TETrace[j].rawAtInvoke
        /\ raw  = _TETrace[i].raw
        /\ raw' = _TETrace[j].raw

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("TerminalExit_TTrace_1791155391.json", _TETrace)

=============================================================================

 Note that you can extract this module `TerminalExit_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `TerminalExit_TEExpression.tla` file takes precedence 
  over the module `TerminalExit_TEExpression` below).

---- MODULE TerminalExit_TEExpression ----
EXTENDS Sequences, TLCExt, TerminalExit, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `TerminalExit` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        inputDone |-> inputDone
        ,pasteOpen |-> pasteOpen
        ,pasteStarted |-> pasteStarted
        ,stopping |-> stopping
        ,outputs |-> outputs
        ,phase |-> phase
        ,cgClosed |-> cgClosed
        ,localReleased |-> localReleased
        ,workDone |-> workDone
        ,rawAtInvoke |-> rawAtInvoke
        ,raw |-> raw
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_inputDoneUnchanged |-> inputDone = inputDone'
        
        \* Format the `inputDone` variable as Json value.
        \* ,_inputDoneJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(inputDone)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_inputDoneModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].inputDone # _TETrace[s-1].inputDone
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE TerminalExit_TETrace ----
\*EXTENDS IOUtils, TerminalExit, TLC
\*
\*trace == IODeserialize("TerminalExit_TTrace_1791155391.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE TerminalExit_TETrace ----
EXTENDS TerminalExit, TLC

trace == 
    <<
    ([outputs |-> 0,phase |-> "input",cgClosed |-> FALSE,rawAtInvoke |-> FALSE,pasteStarted |-> FALSE,stopping |-> FALSE,localReleased |-> FALSE,raw |-> TRUE,inputDone |-> FALSE,pasteOpen |-> FALSE,workDone |-> TRUE]),
    ([outputs |-> 0,phase |-> "input",cgClosed |-> FALSE,rawAtInvoke |-> FALSE,pasteStarted |-> TRUE,stopping |-> FALSE,localReleased |-> FALSE,raw |-> TRUE,inputDone |-> FALSE,pasteOpen |-> TRUE,workDone |-> TRUE]),
    ([outputs |-> 0,phase |-> "input",cgClosed |-> FALSE,rawAtInvoke |-> FALSE,pasteStarted |-> TRUE,stopping |-> TRUE,localReleased |-> FALSE,raw |-> TRUE,inputDone |-> FALSE,pasteOpen |-> TRUE,workDone |-> TRUE]),
    ([outputs |-> 0,phase |-> "input",cgClosed |-> FALSE,rawAtInvoke |-> FALSE,pasteStarted |-> TRUE,stopping |-> TRUE,localReleased |-> FALSE,raw |-> FALSE,inputDone |-> FALSE,pasteOpen |-> TRUE,workDone |-> TRUE])
    >>
----


=============================================================================

---- CONFIG TerminalExit_TTrace_1791155391 ----
CONSTANTS
    Mutation = "early-echo"

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
\* Generated on Sun Oct 04 23:09:52 UTC 2026