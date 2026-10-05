---- MODULE PreparedInput_TTrace_1791183653 ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, PreparedInput

_expression ==
    LET PreparedInput_TEExpression == INSTANCE PreparedInput_TEExpression
    IN PreparedInput_TEExpression!expression
----

_trace ==
    LET PreparedInput_TETrace == INSTANCE PreparedInput_TETrace
    IN PreparedInput_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        preview = ("none")
        /\
        phase = ("closed")
        /\
        stopped = (TRUE)
        /\
        interactionStarted = (FALSE)
        /\
        interactionDone = (FALSE)
        /\
        lateSend = (FALSE)
        /\
        sent = (FALSE)
        /\
        actor = ("none")
        /\
        answer = ("none")
        /\
        captured = ("original")
        /\
        selected = ("original")
        /\
        released = (TRUE)
        /\
        workDone = (FALSE)
    )
----

_init ==
    /\ interactionStarted = _TETrace[1].interactionStarted
    /\ interactionDone = _TETrace[1].interactionDone
    /\ lateSend = _TETrace[1].lateSend
    /\ answer = _TETrace[1].answer
    /\ preview = _TETrace[1].preview
    /\ selected = _TETrace[1].selected
    /\ sent = _TETrace[1].sent
    /\ phase = _TETrace[1].phase
    /\ workDone = _TETrace[1].workDone
    /\ captured = _TETrace[1].captured
    /\ stopped = _TETrace[1].stopped
    /\ actor = _TETrace[1].actor
    /\ released = _TETrace[1].released
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ interactionStarted  = _TETrace[i].interactionStarted
        /\ interactionStarted' = _TETrace[j].interactionStarted
        /\ interactionDone  = _TETrace[i].interactionDone
        /\ interactionDone' = _TETrace[j].interactionDone
        /\ lateSend  = _TETrace[i].lateSend
        /\ lateSend' = _TETrace[j].lateSend
        /\ answer  = _TETrace[i].answer
        /\ answer' = _TETrace[j].answer
        /\ preview  = _TETrace[i].preview
        /\ preview' = _TETrace[j].preview
        /\ selected  = _TETrace[i].selected
        /\ selected' = _TETrace[j].selected
        /\ sent  = _TETrace[i].sent
        /\ sent' = _TETrace[j].sent
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ workDone  = _TETrace[i].workDone
        /\ workDone' = _TETrace[j].workDone
        /\ captured  = _TETrace[i].captured
        /\ captured' = _TETrace[j].captured
        /\ stopped  = _TETrace[i].stopped
        /\ stopped' = _TETrace[j].stopped
        /\ actor  = _TETrace[i].actor
        /\ actor' = _TETrace[j].actor
        /\ released  = _TETrace[i].released
        /\ released' = _TETrace[j].released

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("PreparedInput_TTrace_1791183653.json", _TETrace)

=============================================================================

 Note that you can extract this module `PreparedInput_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `PreparedInput_TEExpression.tla` file takes precedence 
  over the module `PreparedInput_TEExpression` below).

---- MODULE PreparedInput_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, PreparedInput

expression == 
    [
        \* To hide variables of the `PreparedInput` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        interactionStarted |-> interactionStarted
        ,interactionDone |-> interactionDone
        ,lateSend |-> lateSend
        ,answer |-> answer
        ,preview |-> preview
        ,selected |-> selected
        ,sent |-> sent
        ,phase |-> phase
        ,workDone |-> workDone
        ,captured |-> captured
        ,stopped |-> stopped
        ,actor |-> actor
        ,released |-> released
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_interactionStartedUnchanged |-> interactionStarted = interactionStarted'
        
        \* Format the `interactionStarted` variable as Json value.
        \* ,_interactionStartedJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(interactionStarted)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_interactionStartedModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].interactionStarted # _TETrace[s-1].interactionStarted
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE PreparedInput_TETrace ----
\*EXTENDS IOUtils, TLC, PreparedInput
\*
\*trace == IODeserialize("PreparedInput_TTrace_1791183653.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE PreparedInput_TETrace ----
EXTENDS TLC, PreparedInput

trace == 
    <<
    ([preview |-> "none",phase |-> "captured",stopped |-> FALSE,interactionStarted |-> FALSE,interactionDone |-> FALSE,lateSend |-> FALSE,sent |-> FALSE,actor |-> "none",answer |-> "none",captured |-> "original",selected |-> "original",released |-> FALSE,workDone |-> FALSE]),
    ([preview |-> "none",phase |-> "captured",stopped |-> TRUE,interactionStarted |-> FALSE,interactionDone |-> FALSE,lateSend |-> FALSE,sent |-> FALSE,actor |-> "none",answer |-> "none",captured |-> "original",selected |-> "original",released |-> FALSE,workDone |-> FALSE]),
    ([preview |-> "none",phase |-> "settling",stopped |-> TRUE,interactionStarted |-> FALSE,interactionDone |-> FALSE,lateSend |-> FALSE,sent |-> FALSE,actor |-> "none",answer |-> "none",captured |-> "original",selected |-> "original",released |-> FALSE,workDone |-> FALSE]),
    ([preview |-> "none",phase |-> "closed",stopped |-> TRUE,interactionStarted |-> FALSE,interactionDone |-> FALSE,lateSend |-> FALSE,sent |-> FALSE,actor |-> "none",answer |-> "none",captured |-> "original",selected |-> "original",released |-> TRUE,workDone |-> FALSE])
    >>
----


=============================================================================

---- CONFIG PreparedInput_TTrace_1791183653 ----
CONSTANTS
    Mutation = "early-release"

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
\* Generated on Mon Oct 05 07:00:54 UTC 2026