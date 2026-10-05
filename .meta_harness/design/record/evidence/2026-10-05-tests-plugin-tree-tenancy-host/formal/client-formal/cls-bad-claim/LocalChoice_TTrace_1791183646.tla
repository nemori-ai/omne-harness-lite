---- MODULE LocalChoice_TTrace_1791183646 ----
EXTENDS Sequences, TLCExt, LocalChoice, Toolbox, Naturals, TLC

_expression ==
    LET LocalChoice_TEExpression == INSTANCE LocalChoice_TEExpression
    IN LocalChoice_TEExpression!expression
----

_trace ==
    LET LocalChoice_TETrace == INSTANCE LocalChoice_TETrace
    IN LocalChoice_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        phase = ([logout |-> "done", login |-> "idle"])
        /\
        current = ([instance |-> 0, revision |-> 1, value |-> "none"])
        /\
        permitted = ([logout |-> FALSE, login |-> FALSE])
        /\
        answer = ([logout |-> "not-installed", login |-> "none"])
        /\
        lastBefore = ([instance |-> 0, revision |-> 0, value |-> "old"])
        /\
        wrote = ([logout |-> TRUE, login |-> FALSE])
        /\
        reset = (FALSE)
        /\
        lastExpected = ([instance |-> 0, revision |-> 0, value |-> "old"])
        /\
        snapshot = ([logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]])
    )
----

_init ==
    /\ lastBefore = _TETrace[1].lastBefore
    /\ permitted = _TETrace[1].permitted
    /\ wrote = _TETrace[1].wrote
    /\ answer = _TETrace[1].answer
    /\ reset = _TETrace[1].reset
    /\ lastExpected = _TETrace[1].lastExpected
    /\ current = _TETrace[1].current
    /\ phase = _TETrace[1].phase
    /\ snapshot = _TETrace[1].snapshot
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ lastBefore  = _TETrace[i].lastBefore
        /\ lastBefore' = _TETrace[j].lastBefore
        /\ permitted  = _TETrace[i].permitted
        /\ permitted' = _TETrace[j].permitted
        /\ wrote  = _TETrace[i].wrote
        /\ wrote' = _TETrace[j].wrote
        /\ answer  = _TETrace[i].answer
        /\ answer' = _TETrace[j].answer
        /\ reset  = _TETrace[i].reset
        /\ reset' = _TETrace[j].reset
        /\ lastExpected  = _TETrace[i].lastExpected
        /\ lastExpected' = _TETrace[j].lastExpected
        /\ current  = _TETrace[i].current
        /\ current' = _TETrace[j].current
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ snapshot  = _TETrace[i].snapshot
        /\ snapshot' = _TETrace[j].snapshot

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("LocalChoice_TTrace_1791183646.json", _TETrace)

=============================================================================

 Note that you can extract this module `LocalChoice_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `LocalChoice_TEExpression.tla` file takes precedence 
  over the module `LocalChoice_TEExpression` below).

---- MODULE LocalChoice_TEExpression ----
EXTENDS Sequences, TLCExt, LocalChoice, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `LocalChoice` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        lastBefore |-> lastBefore
        ,permitted |-> permitted
        ,wrote |-> wrote
        ,answer |-> answer
        ,reset |-> reset
        ,lastExpected |-> lastExpected
        ,current |-> current
        ,phase |-> phase
        ,snapshot |-> snapshot
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_lastBeforeUnchanged |-> lastBefore = lastBefore'
        
        \* Format the `lastBefore` variable as Json value.
        \* ,_lastBeforeJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(lastBefore)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_lastBeforeModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].lastBefore # _TETrace[s-1].lastBefore
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE LocalChoice_TETrace ----
\*EXTENDS IOUtils, LocalChoice, TLC
\*
\*trace == IODeserialize("LocalChoice_TTrace_1791183646.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE LocalChoice_TETrace ----
EXTENDS LocalChoice, TLC

trace == 
    <<
    ([phase |-> [logout |-> "idle", login |-> "idle"],current |-> [instance |-> 0, revision |-> 0, value |-> "old"],permitted |-> [logout |-> FALSE, login |-> FALSE],answer |-> [logout |-> "none", login |-> "none"],lastBefore |-> [instance |-> 0, revision |-> 0, value |-> "old"],wrote |-> [logout |-> FALSE, login |-> FALSE],reset |-> FALSE,lastExpected |-> [instance |-> 0, revision |-> 0, value |-> "old"],snapshot |-> [logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]]]),
    ([phase |-> [logout |-> "waiting", login |-> "idle"],current |-> [instance |-> 0, revision |-> 0, value |-> "old"],permitted |-> [logout |-> FALSE, login |-> FALSE],answer |-> [logout |-> "none", login |-> "none"],lastBefore |-> [instance |-> 0, revision |-> 0, value |-> "old"],wrote |-> [logout |-> FALSE, login |-> FALSE],reset |-> FALSE,lastExpected |-> [instance |-> 0, revision |-> 0, value |-> "old"],snapshot |-> [logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]]]),
    ([phase |-> [logout |-> "ready", login |-> "idle"],current |-> [instance |-> 0, revision |-> 0, value |-> "old"],permitted |-> [logout |-> FALSE, login |-> FALSE],answer |-> [logout |-> "none", login |-> "none"],lastBefore |-> [instance |-> 0, revision |-> 0, value |-> "old"],wrote |-> [logout |-> FALSE, login |-> FALSE],reset |-> FALSE,lastExpected |-> [instance |-> 0, revision |-> 0, value |-> "old"],snapshot |-> [logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]]]),
    ([phase |-> [logout |-> "committed", login |-> "idle"],current |-> [instance |-> 0, revision |-> 1, value |-> "none"],permitted |-> [logout |-> FALSE, login |-> FALSE],answer |-> [logout |-> "none", login |-> "none"],lastBefore |-> [instance |-> 0, revision |-> 0, value |-> "old"],wrote |-> [logout |-> TRUE, login |-> FALSE],reset |-> FALSE,lastExpected |-> [instance |-> 0, revision |-> 0, value |-> "old"],snapshot |-> [logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]]]),
    ([phase |-> [logout |-> "done", login |-> "idle"],current |-> [instance |-> 0, revision |-> 1, value |-> "none"],permitted |-> [logout |-> FALSE, login |-> FALSE],answer |-> [logout |-> "not-installed", login |-> "none"],lastBefore |-> [instance |-> 0, revision |-> 0, value |-> "old"],wrote |-> [logout |-> TRUE, login |-> FALSE],reset |-> FALSE,lastExpected |-> [instance |-> 0, revision |-> 0, value |-> "old"],snapshot |-> [logout |-> [instance |-> 0, revision |-> 0, value |-> "old"], login |-> [instance |-> 0, revision |-> 0, value |-> "old"]]])
    >>
----


=============================================================================

---- CONFIG LocalChoice_TTrace_1791183646 ----
CONSTANTS
    Mutation = "lie"

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
\* Generated on Mon Oct 05 07:00:46 UTC 2026