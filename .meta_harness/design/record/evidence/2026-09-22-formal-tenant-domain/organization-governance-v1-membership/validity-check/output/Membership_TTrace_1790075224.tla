---- MODULE Membership_TTrace_1790075224 ----
EXTENDS Membership_TEConstants, Sequences, TLCExt, Toolbox, Membership, Naturals, TLC

_expression ==
    LET Membership_TEExpression == INSTANCE Membership_TEExpression
    IN Membership_TEExpression!expression
----

_trace ==
    LET Membership_TETrace == INSTANCE Membership_TETrace
    IN Membership_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        effective = ({})
        /\
        isSuper = ((a1 :> TRUE @@ a2 :> TRUE))
        /\
        staged = ((a1 :> [kind |-> "none", target |-> "none"] @@ a2 :> [kind |-> "none", target |-> "none"]))
    )
----

_init ==
    /\ effective = _TETrace[1].effective
    /\ staged = _TETrace[1].staged
    /\ isSuper = _TETrace[1].isSuper
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ effective  = _TETrace[i].effective
        /\ effective' = _TETrace[j].effective
        /\ staged  = _TETrace[i].staged
        /\ staged' = _TETrace[j].staged
        /\ isSuper  = _TETrace[i].isSuper
        /\ isSuper' = _TETrace[j].isSuper

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("Membership_TTrace_1790075224.json", _TETrace)

=============================================================================

 Note that you can extract this module `Membership_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `Membership_TEExpression.tla` file takes precedence 
  over the module `Membership_TEExpression` below).

---- MODULE Membership_TEExpression ----
EXTENDS Membership_TEConstants, Sequences, TLCExt, Toolbox, Membership, Naturals, TLC

expression == 
    [
        \* To hide variables of the `Membership` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        effective |-> effective
        ,staged |-> staged
        ,isSuper |-> isSuper
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_effectiveUnchanged |-> effective = effective'
        
        \* Format the `effective` variable as Json value.
        \* ,_effectiveJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(effective)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_effectiveModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].effective # _TETrace[s-1].effective
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE Membership_TETrace ----
\*EXTENDS Membership_TEConstants, IOUtils, Membership, TLC
\*
\*trace == IODeserialize("Membership_TTrace_1790075224.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE Membership_TETrace ----
EXTENDS Membership_TEConstants, Membership, TLC

trace == 
    <<
    ([effective |-> {a1, a2},isSuper |-> (a1 :> TRUE @@ a2 :> TRUE),staged |-> (a1 :> [kind |-> "none", target |-> "none"] @@ a2 :> [kind |-> "none", target |-> "none"])]),
    ([effective |-> {a1, a2},isSuper |-> (a1 :> TRUE @@ a2 :> TRUE),staged |-> (a1 :> [kind |-> "none", target |-> "none"] @@ a2 :> [kind |-> "remove", target |-> a1])]),
    ([effective |-> {a1, a2},isSuper |-> (a1 :> TRUE @@ a2 :> TRUE),staged |-> (a1 :> [kind |-> "remove", target |-> a2] @@ a2 :> [kind |-> "remove", target |-> a1])]),
    ([effective |-> {a1},isSuper |-> (a1 :> TRUE @@ a2 :> TRUE),staged |-> (a1 :> [kind |-> "none", target |-> "none"] @@ a2 :> [kind |-> "remove", target |-> a1])]),
    ([effective |-> {},isSuper |-> (a1 :> TRUE @@ a2 :> TRUE),staged |-> (a1 :> [kind |-> "none", target |-> "none"] @@ a2 :> [kind |-> "none", target |-> "none"])])
    >>
----


=============================================================================

---- MODULE Membership_TEConstants ----
EXTENDS Membership

CONSTANTS a1, a2

=============================================================================

---- CONFIG Membership_TTrace_1790075224 ----
CONSTANTS
    Actors = { a1 , a2 }
    Serialized = FALSE
    a1 = a1
    a2 = a2

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
\* Generated on Tue Sep 22 11:07:04 UTC 2026