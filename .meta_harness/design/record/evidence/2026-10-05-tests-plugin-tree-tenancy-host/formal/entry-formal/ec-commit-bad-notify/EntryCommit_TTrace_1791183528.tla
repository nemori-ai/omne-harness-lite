---- MODULE EntryCommit_TTrace_1791183528 ----
EXTENDS Sequences, TLCExt, Toolbox, EntryCommit, Naturals, TLC

_expression ==
    LET EntryCommit_TEExpression == INSTANCE EntryCommit_TEExpression
    IN EntryCommit_TEExpression!expression
----

_trace ==
    LET EntryCommit_TETrace == INSTANCE EntryCommit_TETrace
    IN EntryCommit_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        committedBusiness = (FALSE)
        /\
        pc = ("finalize")
        /\
        finalClockRead = (FALSE)
        /\
        notified = (TRUE)
        /\
        stagedActivity = (FALSE)
        /\
        reply = ("none")
        /\
        commitKnown = (FALSE)
        /\
        stagedBusiness = (TRUE)
        /\
        committedActivity = (FALSE)
    )
----

_init ==
    /\ committedActivity = _TETrace[1].committedActivity
    /\ commitKnown = _TETrace[1].commitKnown
    /\ reply = _TETrace[1].reply
    /\ notified = _TETrace[1].notified
    /\ stagedBusiness = _TETrace[1].stagedBusiness
    /\ pc = _TETrace[1].pc
    /\ committedBusiness = _TETrace[1].committedBusiness
    /\ finalClockRead = _TETrace[1].finalClockRead
    /\ stagedActivity = _TETrace[1].stagedActivity
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ committedActivity  = _TETrace[i].committedActivity
        /\ committedActivity' = _TETrace[j].committedActivity
        /\ commitKnown  = _TETrace[i].commitKnown
        /\ commitKnown' = _TETrace[j].commitKnown
        /\ reply  = _TETrace[i].reply
        /\ reply' = _TETrace[j].reply
        /\ notified  = _TETrace[i].notified
        /\ notified' = _TETrace[j].notified
        /\ stagedBusiness  = _TETrace[i].stagedBusiness
        /\ stagedBusiness' = _TETrace[j].stagedBusiness
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc
        /\ committedBusiness  = _TETrace[i].committedBusiness
        /\ committedBusiness' = _TETrace[j].committedBusiness
        /\ finalClockRead  = _TETrace[i].finalClockRead
        /\ finalClockRead' = _TETrace[j].finalClockRead
        /\ stagedActivity  = _TETrace[i].stagedActivity
        /\ stagedActivity' = _TETrace[j].stagedActivity

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("EntryCommit_TTrace_1791183528.json", _TETrace)

=============================================================================

 Note that you can extract this module `EntryCommit_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `EntryCommit_TEExpression.tla` file takes precedence 
  over the module `EntryCommit_TEExpression` below).

---- MODULE EntryCommit_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, EntryCommit, Naturals, TLC

expression == 
    [
        \* To hide variables of the `EntryCommit` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        committedActivity |-> committedActivity
        ,commitKnown |-> commitKnown
        ,reply |-> reply
        ,notified |-> notified
        ,stagedBusiness |-> stagedBusiness
        ,pc |-> pc
        ,committedBusiness |-> committedBusiness
        ,finalClockRead |-> finalClockRead
        ,stagedActivity |-> stagedActivity
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_committedActivityUnchanged |-> committedActivity = committedActivity'
        
        \* Format the `committedActivity` variable as Json value.
        \* ,_committedActivityJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(committedActivity)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_committedActivityModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].committedActivity # _TETrace[s-1].committedActivity
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE EntryCommit_TETrace ----
\*EXTENDS IOUtils, EntryCommit, TLC
\*
\*trace == IODeserialize("EntryCommit_TTrace_1791183528.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE EntryCommit_TETrace ----
EXTENDS EntryCommit, TLC

trace == 
    <<
    ([committedBusiness |-> FALSE,pc |-> "business",finalClockRead |-> FALSE,notified |-> FALSE,stagedActivity |-> FALSE,reply |-> "none",commitKnown |-> FALSE,stagedBusiness |-> FALSE,committedActivity |-> FALSE]),
    ([committedBusiness |-> FALSE,pc |-> "finalize",finalClockRead |-> FALSE,notified |-> TRUE,stagedActivity |-> FALSE,reply |-> "none",commitKnown |-> FALSE,stagedBusiness |-> TRUE,committedActivity |-> FALSE])
    >>
----


=============================================================================

---- CONFIG EntryCommit_TTrace_1791183528 ----
CONSTANTS
    SwallowClockFailure = FALSE
    NotifyEarly = TRUE

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
\* Generated on Mon Oct 05 06:58:49 UTC 2026