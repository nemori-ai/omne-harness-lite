--------------------------- MODULE AgentRegistry ---------------------------
EXTENDS Naturals, FiniteSets, Sequences

CONSTANTS Ids, Tokens, None, UnsafeEarlyDetach, UnsafeStaleDetach
ASSUME /\ None \notin (Ids \cup Tokens)
       /\ IsFiniteSet(Ids) /\ IsFiniteSet(Tokens)
       /\ Ids # {} /\ Tokens # {}

VARIABLES live, used, identity, order, announced, announcing, requested,
          detached, createdCount, disposedCount, failed
vars == <<live, used, identity, order, announced, announcing, requested,
          detached, createdCount, disposedCount, failed>>
LiveTokens == {live[i] : i \in Ids} \ {None}

Init == /\ live = [i \in Ids |-> None]
        /\ used = {}
        /\ identity = [t \in Tokens |-> None]
        /\ order = <<>>
        /\ announced = {} /\ announcing = {} /\ requested = {}
        /\ detached = {} /\ failed = {}
        /\ createdCount = [t \in Tokens |-> 0]
        /\ disposedCount = [t \in Tokens |-> 0]

Enter(t, i) ==
    /\ t \notin used /\ live[i] = None
    /\ live' = [live EXCEPT ![i] = t]
    /\ used' = used \cup {t}
    /\ identity' = [identity EXCEPT ![t] = i]
    /\ order' = Append(order, t)
    /\ UNCHANGED <<announced, announcing, requested, detached,
                    createdCount, disposedCount, failed>>

BeginAnnounce(t) ==
    /\ t \in LiveTokens \ announced
    /\ announced' = announced \cup {t}
    /\ announcing' = announcing \cup {t}
    /\ createdCount' = [createdCount EXCEPT ![t] = @ + 1]
    /\ UNCHANGED <<live, used, identity, order, requested, detached,
                    disposedCount, failed>>

Remove(t) ==
    /\ live' = [live EXCEPT ![identity[t]] = None]
    /\ detached' = detached \cup {t}
    /\ disposedCount' = [disposedCount EXCEPT
                          ![t] = @ + (IF t \in announced THEN 1 ELSE 0)]

Detach(t) ==
    /\ t \in LiveTokens \ requested
    /\ IF t \in announcing
          THEN /\ requested' = requested \cup {t}
               /\ IF UnsafeEarlyDetach THEN Remove(t)
                     ELSE UNCHANGED <<live, detached, disposedCount>>
          ELSE /\ Remove(t)
               /\ UNCHANGED requested
    /\ UNCHANGED <<used, identity, order, announced, announcing,
                    createdCount, failed>>

EndAnnounce(t, throws) ==
    /\ t \in announcing
    /\ announcing' = announcing \ {t}
    /\ failed' = IF throws THEN failed \cup {t} ELSE failed
    /\ IF t \in requested
          THEN /\ Remove(t) /\ requested' = requested \ {t}
          ELSE UNCHANGED <<live, detached, disposedCount, requested>>
    /\ UNCHANGED <<used, identity, order, announced, createdCount>>

\* A returned detach is single-shot. A used capability is a no-op even after
\* the Session ID has been reused. The mutant deletes the new registration.
OldDetach(t) ==
    /\ t \in detached
    /\ live' = IF UnsafeStaleDetach
                  THEN [live EXCEPT ![identity[t]] = None] ELSE live
    /\ UNCHANGED <<used, identity, order, announced, announcing, requested,
                    detached, createdCount, disposedCount, failed>>

Next == \/ \E t \in Tokens, i \in Ids : Enter(t, i)
        \/ \E t \in Tokens : BeginAnnounce(t) \/ Detach(t) \/ OldDetach(t)
        \/ \E t \in Tokens, throws \in BOOLEAN : EndAnnounce(t, throws)
Spec == Init /\ [][Next]_vars

TypeOK == /\ live \in [Ids -> Tokens \cup {None}]
          /\ identity \in [Tokens -> Ids \cup {None}]
          /\ used \subseteq Tokens /\ detached \subseteq used
          /\ announced \subseteq used /\ announcing \subseteq announced
          /\ requested \subseteq used /\ failed \subseteq announced
          /\ order \in Seq(Tokens)
          /\ createdCount \in [Tokens -> 0..1]
          /\ disposedCount \in [Tokens -> 0..1]
Identity == \A i \in Ids : live[i] # None => identity[live[i]] = i
Unique == \A i, j \in Ids : (live[i] # None /\ live[i] = live[j]) => i = j
Conservation == used = LiveTokens \cup detached /\ LiveTokens \cap detached = {}
DispatchVisibility == announcing \subseteq LiveTokens
DeferredDetach == requested \subseteq announcing
PairedDisposal == \A t \in Tokens :
    /\ createdCount[t] = (IF t \in announced THEN 1 ELSE 0)
    /\ disposedCount[t] = (IF t \in detached \cap announced THEN 1 ELSE 0)
RegistrationOrder == /\ Len(order) = Cardinality(used)
                     /\ {order[n] : n \in 1..Len(order)} = used
=============================================================================
