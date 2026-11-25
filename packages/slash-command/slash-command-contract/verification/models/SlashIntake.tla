---------------------------- MODULE SlashIntake ----------------------------
(* One session, one sender, two skills. The catalogue changes while the sender
   types. Question: can an input ever be accepted with a meaning the sender was
   not shown, or with a skill that is revoked at the moment of acceptance?      *)
EXTENDS FiniteSets, Naturals

CONSTANTS Skills, Guard      \* Guard = TRUE: the accepting side compares with what the sender saw
VARIABLES usable,            \* skills this subject may reference now (the authority)
          listed,            \* skills on the session's list now: published, enabled, not removed
          shown,             \* what the client last read of the catalogue
          draft,             \* names written in the input box
          sent,              \* in flight: [names, expect]; empty names means nothing is in flight
          last               \* the latest acceptance: [refs, expect, usableThen]

vars == <<usable, listed, shown, draft, sent, last>>
Idle == [names |-> {}, expect |-> {}]

Meaning(names, set) == names \cap set          \* which written names are references under a catalogue
Live == usable \cap listed                    \* the list is computed now: every change counts at once

Init == /\ usable = Skills /\ listed = Skills /\ shown = Skills
        /\ draft = {} /\ sent = Idle
        /\ last = [refs |-> {}, expect |-> {}, usableThen |-> Skills]

Write(n)  == /\ sent = Idle /\ n \notin draft /\ draft' = draft \cup {n}
             /\ UNCHANGED <<usable, listed, shown, sent, last>>
Revoke(n) == /\ n \in usable /\ usable' = usable \ {n}
             /\ UNCHANGED <<listed, shown, draft, sent, last>>
Grant(n)  == /\ n \notin usable /\ usable' = usable \cup {n}
             /\ UNCHANGED <<listed, shown, draft, sent, last>>
Unlist(n)   == /\ n \in listed /\ listed' = listed \ {n}        \* disabled or removed
             /\ UNCHANGED <<usable, shown, draft, sent, last>>
List(n)  == /\ n \notin listed /\ listed' = listed \cup {n}  \* published or enabled
             /\ UNCHANGED <<usable, shown, draft, sent, last>>
Refresh   == /\ shown' = Live
             /\ UNCHANGED <<usable, listed, draft, sent, last>>
Send      == /\ sent = Idle /\ draft # {}
             /\ sent' = [names |-> draft, expect |-> Meaning(draft, shown)]
             /\ UNCHANGED <<usable, listed, shown, draft, last>>
Admit     == /\ sent # Idle
             /\ LET now == Meaning(sent.names, Live)
                IN IF Guard /\ now # sent.expect
                   THEN UNCHANGED <<draft, last>>                \* refused: the input stays in the box
                   ELSE /\ last' = [refs |-> now, expect |-> sent.expect, usableThen |-> usable]
                        /\ draft' = {}
             /\ sent' = Idle
             /\ UNCHANGED <<usable, listed, shown>>

Next == \/ \E n \in Skills : Write(n) \/ Revoke(n) \/ Grant(n) \/ Unlist(n) \/ List(n)
        \/ Refresh \/ Send \/ Admit

Spec == Init /\ [][Next]_vars

\* The sender is never given a meaning other than the one shown.
AsShown == last.refs = last.expect
\* A revoked skill is never loaded, whatever the client believed.
NoRevoked == last.refs \subseteq last.usableThen
=============================================================================
