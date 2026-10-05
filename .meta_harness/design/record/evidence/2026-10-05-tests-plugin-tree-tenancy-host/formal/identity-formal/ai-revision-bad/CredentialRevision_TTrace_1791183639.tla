---- MODULE CredentialRevision_TTrace_1791183639 ----
EXTENDS Sequences, CredentialRevision, TLCExt, Toolbox, Naturals, TLC

_expression ==
    LET CredentialRevision_TEExpression == INSTANCE CredentialRevision_TEExpression
    IN CredentialRevision_TEExpression!expression
----

_trace ==
    LET CredentialRevision_TETrace == INSTANCE CredentialRevision_TETrace
    IN CredentialRevision_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        phase = ("done")
        /\
        issueSnapshot = (0)
        /\
        loginRevision = (1)
        /\
        issued = (TRUE)
        /\
        snapshot = (0)
        /\
        changed = (TRUE)
        /\
        revision = (1)
    )
----

_init ==
    /\ changed = _TETrace[1].changed
    /\ revision = _TETrace[1].revision
    /\ loginRevision = _TETrace[1].loginRevision
    /\ issueSnapshot = _TETrace[1].issueSnapshot
    /\ phase = _TETrace[1].phase
    /\ snapshot = _TETrace[1].snapshot
    /\ issued = _TETrace[1].issued
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ changed  = _TETrace[i].changed
        /\ changed' = _TETrace[j].changed
        /\ revision  = _TETrace[i].revision
        /\ revision' = _TETrace[j].revision
        /\ loginRevision  = _TETrace[i].loginRevision
        /\ loginRevision' = _TETrace[j].loginRevision
        /\ issueSnapshot  = _TETrace[i].issueSnapshot
        /\ issueSnapshot' = _TETrace[j].issueSnapshot
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ snapshot  = _TETrace[i].snapshot
        /\ snapshot' = _TETrace[j].snapshot
        /\ issued  = _TETrace[i].issued
        /\ issued' = _TETrace[j].issued

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("CredentialRevision_TTrace_1791183639.json", _TETrace)

=============================================================================

 Note that you can extract this module `CredentialRevision_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `CredentialRevision_TEExpression.tla` file takes precedence 
  over the module `CredentialRevision_TEExpression` below).

---- MODULE CredentialRevision_TEExpression ----
EXTENDS Sequences, CredentialRevision, TLCExt, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `CredentialRevision` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        changed |-> changed
        ,revision |-> revision
        ,loginRevision |-> loginRevision
        ,issueSnapshot |-> issueSnapshot
        ,phase |-> phase
        ,snapshot |-> snapshot
        ,issued |-> issued
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_changedUnchanged |-> changed = changed'
        
        \* Format the `changed` variable as Json value.
        \* ,_changedJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(changed)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_changedModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].changed # _TETrace[s-1].changed
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE CredentialRevision_TETrace ----
\*EXTENDS IOUtils, CredentialRevision, TLC
\*
\*trace == IODeserialize("CredentialRevision_TTrace_1791183639.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE CredentialRevision_TETrace ----
EXTENDS CredentialRevision, TLC

trace == 
    <<
    ([phase |-> "idle",issueSnapshot |-> 0,loginRevision |-> 0,issued |-> FALSE,snapshot |-> 0,changed |-> FALSE,revision |-> 0]),
    ([phase |-> "verified",issueSnapshot |-> 0,loginRevision |-> 0,issued |-> FALSE,snapshot |-> 0,changed |-> FALSE,revision |-> 0]),
    ([phase |-> "verified",issueSnapshot |-> 0,loginRevision |-> 0,issued |-> FALSE,snapshot |-> 0,changed |-> TRUE,revision |-> 1]),
    ([phase |-> "done",issueSnapshot |-> 0,loginRevision |-> 1,issued |-> TRUE,snapshot |-> 0,changed |-> TRUE,revision |-> 1])
    >>
----


=============================================================================

---- CONFIG CredentialRevision_TTrace_1791183639 ----
CONSTANTS
    CheckRevision = FALSE

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
\* Generated on Mon Oct 05 07:00:39 UTC 2026