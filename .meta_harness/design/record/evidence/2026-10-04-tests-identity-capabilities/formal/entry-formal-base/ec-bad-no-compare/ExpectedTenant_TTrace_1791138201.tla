---- MODULE ExpectedTenant_TTrace_1791138201 ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, ExpectedTenant_TEConstants, ExpectedTenant

_expression ==
    LET ExpectedTenant_TEExpression == INSTANCE ExpectedTenant_TEExpression
    IN ExpectedTenant_TEExpression!expression
----

_trace ==
    LET ExpectedTenant_TETrace == INSTANCE ExpectedTenant_TETrace
    IN ExpectedTenant_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        pc = ("done")
        /\
        effect = (t2)
        /\
        expected = (t1)
        /\
        checked = (t2)
        /\
        selected = (t2)
    )
----

_init ==
    /\ checked = _TETrace[1].checked
    /\ selected = _TETrace[1].selected
    /\ effect = _TETrace[1].effect
    /\ pc = _TETrace[1].pc
    /\ expected = _TETrace[1].expected
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ checked  = _TETrace[i].checked
        /\ checked' = _TETrace[j].checked
        /\ selected  = _TETrace[i].selected
        /\ selected' = _TETrace[j].selected
        /\ effect  = _TETrace[i].effect
        /\ effect' = _TETrace[j].effect
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc
        /\ expected  = _TETrace[i].expected
        /\ expected' = _TETrace[j].expected

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("ExpectedTenant_TTrace_1791138201.json", _TETrace)

=============================================================================

 Note that you can extract this module `ExpectedTenant_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `ExpectedTenant_TEExpression.tla` file takes precedence 
  over the module `ExpectedTenant_TEExpression` below).

---- MODULE ExpectedTenant_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, ExpectedTenant_TEConstants, ExpectedTenant

expression == 
    [
        \* To hide variables of the `ExpectedTenant` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        checked |-> checked
        ,selected |-> selected
        ,effect |-> effect
        ,pc |-> pc
        ,expected |-> expected
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_checkedUnchanged |-> checked = checked'
        
        \* Format the `checked` variable as Json value.
        \* ,_checkedJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(checked)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_checkedModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].checked # _TETrace[s-1].checked
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE ExpectedTenant_TETrace ----
\*EXTENDS IOUtils, TLC, ExpectedTenant_TEConstants, ExpectedTenant
\*
\*trace == IODeserialize("ExpectedTenant_TTrace_1791138201.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE ExpectedTenant_TETrace ----
EXTENDS TLC, ExpectedTenant_TEConstants, ExpectedTenant

trace == 
    <<
    ([pc |-> "ready",effect |-> "none",expected |-> t1,checked |-> "none",selected |-> t1]),
    ([pc |-> "ready",effect |-> "none",expected |-> t1,checked |-> "none",selected |-> t2]),
    ([pc |-> "checked",effect |-> "none",expected |-> t1,checked |-> t2,selected |-> t2]),
    ([pc |-> "done",effect |-> t2,expected |-> t1,checked |-> t2,selected |-> t2])
    >>
----


=============================================================================

---- MODULE ExpectedTenant_TEConstants ----
EXTENDS ExpectedTenant

CONSTANTS t1, t2

=============================================================================

---- CONFIG ExpectedTenant_TTrace_1791138201 ----
CONSTANTS
    Tenants = { t1 , t2 }
    CompareExpected = FALSE
    ProtectCommit = TRUE
    t2 = t2
    t1 = t1

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
\* Generated on Sun Oct 04 18:23:21 UTC 2026