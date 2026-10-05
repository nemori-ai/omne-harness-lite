---- MODULE Maintenance_TTrace_1791183533 ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, Maintenance

_expression ==
    LET Maintenance_TEExpression == INSTANCE Maintenance_TEExpression
    IN Maintenance_TEExpression!expression
----

_trace ==
    LET Maintenance_TETrace == INSTANCE Maintenance_TETrace
    IN Maintenance_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        owner = (FALSE)
        /\
        phase = ("crashed")
        /\
        handles = (FALSE)
        /\
        plaintext = (TRUE)
        /\
        published = (TRUE)
        /\
        result = ("outcome-unknown")
        /\
        connected = (TRUE)
        /\
        durable = (FALSE)
        /\
        deleted = (TRUE)
        /\
        protected = (FALSE)
        /\
        stopping = (FALSE)
        /\
        crashed = (TRUE)
        /\
        cancelRequested = (FALSE)
        /\
        job = (FALSE)
    )
----

_init ==
    /\ protected = _TETrace[1].protected
    /\ result = _TETrace[1].result
    /\ connected = _TETrace[1].connected
    /\ owner = _TETrace[1].owner
    /\ deleted = _TETrace[1].deleted
    /\ crashed = _TETrace[1].crashed
    /\ cancelRequested = _TETrace[1].cancelRequested
    /\ published = _TETrace[1].published
    /\ stopping = _TETrace[1].stopping
    /\ phase = _TETrace[1].phase
    /\ durable = _TETrace[1].durable
    /\ job = _TETrace[1].job
    /\ plaintext = _TETrace[1].plaintext
    /\ handles = _TETrace[1].handles
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ protected  = _TETrace[i].protected
        /\ protected' = _TETrace[j].protected
        /\ result  = _TETrace[i].result
        /\ result' = _TETrace[j].result
        /\ connected  = _TETrace[i].connected
        /\ connected' = _TETrace[j].connected
        /\ owner  = _TETrace[i].owner
        /\ owner' = _TETrace[j].owner
        /\ deleted  = _TETrace[i].deleted
        /\ deleted' = _TETrace[j].deleted
        /\ crashed  = _TETrace[i].crashed
        /\ crashed' = _TETrace[j].crashed
        /\ cancelRequested  = _TETrace[i].cancelRequested
        /\ cancelRequested' = _TETrace[j].cancelRequested
        /\ published  = _TETrace[i].published
        /\ published' = _TETrace[j].published
        /\ stopping  = _TETrace[i].stopping
        /\ stopping' = _TETrace[j].stopping
        /\ phase  = _TETrace[i].phase
        /\ phase' = _TETrace[j].phase
        /\ durable  = _TETrace[i].durable
        /\ durable' = _TETrace[j].durable
        /\ job  = _TETrace[i].job
        /\ job' = _TETrace[j].job
        /\ plaintext  = _TETrace[i].plaintext
        /\ plaintext' = _TETrace[j].plaintext
        /\ handles  = _TETrace[i].handles
        /\ handles' = _TETrace[j].handles

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("Maintenance_TTrace_1791183533.json", _TETrace)

=============================================================================

 Note that you can extract this module `Maintenance_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `Maintenance_TEExpression.tla` file takes precedence 
  over the module `Maintenance_TEExpression` below).

---- MODULE Maintenance_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, Naturals, TLC, Maintenance

expression == 
    [
        \* To hide variables of the `Maintenance` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        protected |-> protected
        ,result |-> result
        ,connected |-> connected
        ,owner |-> owner
        ,deleted |-> deleted
        ,crashed |-> crashed
        ,cancelRequested |-> cancelRequested
        ,published |-> published
        ,stopping |-> stopping
        ,phase |-> phase
        ,durable |-> durable
        ,job |-> job
        ,plaintext |-> plaintext
        ,handles |-> handles
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_protectedUnchanged |-> protected = protected'
        
        \* Format the `protected` variable as Json value.
        \* ,_protectedJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(protected)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_protectedModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].protected # _TETrace[s-1].protected
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE Maintenance_TETrace ----
\*EXTENDS IOUtils, TLC, Maintenance
\*
\*trace == IODeserialize("Maintenance_TTrace_1791183533.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE Maintenance_TETrace ----
EXTENDS TLC, Maintenance

trace == 
    <<
    ([owner |-> TRUE,phase |-> "accepted",handles |-> TRUE,plaintext |-> FALSE,published |-> FALSE,result |-> "pending",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> FALSE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "protected",handles |-> TRUE,plaintext |-> FALSE,published |-> FALSE,result |-> "pending",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> TRUE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "exporting",handles |-> TRUE,plaintext |-> TRUE,published |-> FALSE,result |-> "pending",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> TRUE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "checked",handles |-> FALSE,plaintext |-> TRUE,published |-> FALSE,result |-> "pending",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> TRUE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "published",handles |-> FALSE,plaintext |-> TRUE,published |-> TRUE,result |-> "pending",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> TRUE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "cleanup",handles |-> FALSE,plaintext |-> TRUE,published |-> TRUE,result |-> "outcome-unknown",connected |-> TRUE,durable |-> FALSE,deleted |-> FALSE,protected |-> TRUE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> TRUE,phase |-> "settled",handles |-> FALSE,plaintext |-> FALSE,published |-> TRUE,result |-> "outcome-unknown",connected |-> TRUE,durable |-> FALSE,deleted |-> TRUE,protected |-> FALSE,stopping |-> FALSE,crashed |-> FALSE,cancelRequested |-> FALSE,job |-> TRUE]),
    ([owner |-> FALSE,phase |-> "crashed",handles |-> FALSE,plaintext |-> TRUE,published |-> TRUE,result |-> "outcome-unknown",connected |-> TRUE,durable |-> FALSE,deleted |-> TRUE,protected |-> FALSE,stopping |-> FALSE,crashed |-> TRUE,cancelRequested |-> FALSE,job |-> FALSE])
    >>
----


=============================================================================

---- CONFIG Maintenance_TTrace_1791183533 ----
CONSTANTS
    Fault = "removeProtection"

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
\* Generated on Mon Oct 05 06:58:53 UTC 2026