---- MODULE EntryDecision_TTrace_1791183525 ----
EXTENDS Sequences, TLCExt, Toolbox, EntryDecision, Naturals, TLC

_expression ==
    LET EntryDecision_TEExpression == INSTANCE EntryDecision_TEExpression
    IN EntryDecision_TEExpression!expression
----

_trace ==
    LET EntryDecision_TETrace == INSTANCE EntryDecision_TETrace
    IN EntryDecision_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        payloadOk = (TRUE)
        /\
        decision = ("result")
        /\
        pres = ("valid")
        /\
        passedAuth = (TRUE)
        /\
        postAuthRead = (TRUE)
        /\
        stateNotValidSeen = (TRUE)
        /\
        domainCalled = (TRUE)
        /\
        envelopeOk = (TRUE)
        /\
        gatePassed = (FALSE)
        /\
        route = ("auth")
        /\
        pc = ("classified")
        /\
        versionOk = (TRUE)
        /\
        defectRecorded = (FALSE)
        /\
        presentationRead = (TRUE)
        /\
        rejectionJudged = (FALSE)
        /\
        lookupFailed = (FALSE)
        /\
        invalidated = (TRUE)
    )
----

_init ==
    /\ postAuthRead = _TETrace[1].postAuthRead
    /\ payloadOk = _TETrace[1].payloadOk
    /\ decision = _TETrace[1].decision
    /\ presentationRead = _TETrace[1].presentationRead
    /\ envelopeOk = _TETrace[1].envelopeOk
    /\ pres = _TETrace[1].pres
    /\ stateNotValidSeen = _TETrace[1].stateNotValidSeen
    /\ gatePassed = _TETrace[1].gatePassed
    /\ route = _TETrace[1].route
    /\ domainCalled = _TETrace[1].domainCalled
    /\ pc = _TETrace[1].pc
    /\ versionOk = _TETrace[1].versionOk
    /\ invalidated = _TETrace[1].invalidated
    /\ defectRecorded = _TETrace[1].defectRecorded
    /\ passedAuth = _TETrace[1].passedAuth
    /\ rejectionJudged = _TETrace[1].rejectionJudged
    /\ lookupFailed = _TETrace[1].lookupFailed
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ postAuthRead  = _TETrace[i].postAuthRead
        /\ postAuthRead' = _TETrace[j].postAuthRead
        /\ payloadOk  = _TETrace[i].payloadOk
        /\ payloadOk' = _TETrace[j].payloadOk
        /\ decision  = _TETrace[i].decision
        /\ decision' = _TETrace[j].decision
        /\ presentationRead  = _TETrace[i].presentationRead
        /\ presentationRead' = _TETrace[j].presentationRead
        /\ envelopeOk  = _TETrace[i].envelopeOk
        /\ envelopeOk' = _TETrace[j].envelopeOk
        /\ pres  = _TETrace[i].pres
        /\ pres' = _TETrace[j].pres
        /\ stateNotValidSeen  = _TETrace[i].stateNotValidSeen
        /\ stateNotValidSeen' = _TETrace[j].stateNotValidSeen
        /\ gatePassed  = _TETrace[i].gatePassed
        /\ gatePassed' = _TETrace[j].gatePassed
        /\ route  = _TETrace[i].route
        /\ route' = _TETrace[j].route
        /\ domainCalled  = _TETrace[i].domainCalled
        /\ domainCalled' = _TETrace[j].domainCalled
        /\ pc  = _TETrace[i].pc
        /\ pc' = _TETrace[j].pc
        /\ versionOk  = _TETrace[i].versionOk
        /\ versionOk' = _TETrace[j].versionOk
        /\ invalidated  = _TETrace[i].invalidated
        /\ invalidated' = _TETrace[j].invalidated
        /\ defectRecorded  = _TETrace[i].defectRecorded
        /\ defectRecorded' = _TETrace[j].defectRecorded
        /\ passedAuth  = _TETrace[i].passedAuth
        /\ passedAuth' = _TETrace[j].passedAuth
        /\ rejectionJudged  = _TETrace[i].rejectionJudged
        /\ rejectionJudged' = _TETrace[j].rejectionJudged
        /\ lookupFailed  = _TETrace[i].lookupFailed
        /\ lookupFailed' = _TETrace[j].lookupFailed

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("EntryDecision_TTrace_1791183525.json", _TETrace)

=============================================================================

 Note that you can extract this module `EntryDecision_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `EntryDecision_TEExpression.tla` file takes precedence 
  over the module `EntryDecision_TEExpression` below).

---- MODULE EntryDecision_TEExpression ----
EXTENDS Sequences, TLCExt, Toolbox, EntryDecision, Naturals, TLC

expression == 
    [
        \* To hide variables of the `EntryDecision` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        postAuthRead |-> postAuthRead
        ,payloadOk |-> payloadOk
        ,decision |-> decision
        ,presentationRead |-> presentationRead
        ,envelopeOk |-> envelopeOk
        ,pres |-> pres
        ,stateNotValidSeen |-> stateNotValidSeen
        ,gatePassed |-> gatePassed
        ,route |-> route
        ,domainCalled |-> domainCalled
        ,pc |-> pc
        ,versionOk |-> versionOk
        ,invalidated |-> invalidated
        ,defectRecorded |-> defectRecorded
        ,passedAuth |-> passedAuth
        ,rejectionJudged |-> rejectionJudged
        ,lookupFailed |-> lookupFailed
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_postAuthReadUnchanged |-> postAuthRead = postAuthRead'
        
        \* Format the `postAuthRead` variable as Json value.
        \* ,_postAuthReadJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(postAuthRead)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_postAuthReadModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].postAuthRead # _TETrace[s-1].postAuthRead
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE EntryDecision_TETrace ----
\*EXTENDS IOUtils, EntryDecision, TLC
\*
\*trace == IODeserialize("EntryDecision_TTrace_1791183525.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE EntryDecision_TETrace ----
EXTENDS EntryDecision, TLC

trace == 
    <<
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> FALSE,postAuthRead |-> FALSE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "start",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> FALSE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> FALSE,postAuthRead |-> FALSE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "envelope",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> FALSE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> FALSE,postAuthRead |-> FALSE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "auth",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> FALSE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> TRUE,postAuthRead |-> FALSE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "payload",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> TRUE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> TRUE,postAuthRead |-> FALSE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "derive",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> TRUE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> TRUE,postAuthRead |-> TRUE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "dispatch",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> TRUE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> FALSE]),
    ([payloadOk |-> TRUE,decision |-> "none",pres |-> "valid",passedAuth |-> TRUE,postAuthRead |-> TRUE,stateNotValidSeen |-> FALSE,domainCalled |-> FALSE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "dispatch",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> TRUE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> TRUE]),
    ([payloadOk |-> TRUE,decision |-> "result",pres |-> "valid",passedAuth |-> TRUE,postAuthRead |-> TRUE,stateNotValidSeen |-> TRUE,domainCalled |-> TRUE,envelopeOk |-> TRUE,gatePassed |-> FALSE,route |-> "auth",pc |-> "classified",versionOk |-> TRUE,defectRecorded |-> FALSE,presentationRead |-> TRUE,rejectionJudged |-> FALSE,lookupFailed |-> FALSE,invalidated |-> TRUE])
    >>
----


=============================================================================

---- CONFIG EntryDecision_TTrace_1791183525 ----
CONSTANTS
    Mutation = "passthroughStateNotValid"

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
\* Generated on Mon Oct 05 06:58:45 UTC 2026