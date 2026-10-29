-------------------------- MODULE FrozenActive --------------------------
EXTENDS Naturals, Integers, Sequences, FiniteSets, TLC
CONSTANTS Bug, Takes, Normal, Ends
Inputs == {1, 2}
Ev(kind, batch) == [kind |-> kind, batch |-> batch]
InitialRaw == <<Ev("taken", {1}), Ev("effect", {})>>
Taken(raw) == UNION {raw[k].batch : k \in 1..Len(raw)}
HasEnd(raw) == \E k \in 1..Len(raw) : raw[k].kind="ended"
Cut(raw) == IF HasEnd(raw) THEN Len(raw)-1 ELSE Len(raw)
Relations(q, rels) == {r \in rels : r[1] \in q}
Related(q, rels) == IF Relations(q, rels)={} THEN {} ELSE {1}
Batch(raw, lo, hi) == UNION {raw[k].batch : k \in (lo+1)..hi}
Need(raw, hi) == {k \in 1..hi : raw[k].kind#"silent"}
VARIABLES s, p, take, normal, watch
vars == <<s,p,take,normal,watch>>
IdlePrep == [stage |-> "idle", root |-> 0, q |-> {}, dirs |-> {},
             rels |-> {}, es |-> {}, raw |-> <<>>, limit |-> 0,
             scan |-> 0, closed |-> FALSE]
IdleTake == [stage |-> "idle", root |-> 0]
IdleNormal == [stage |-> "idle", root |-> 0, k |-> 0, mode |-> "prefix"]
Init ==
 /\ s=[root |-> 0, accepted |-> {1}, pending |-> {1},
        admissions |-> {1}, rels |-> {<<1,1>>}, se35 |-> {},
        raw |-> InitialRaw, cursor |-> 0, effects |-> {}, se14 |-> {},
        answers |-> {}, release |-> [i \in Inputs |-> 0],
        active |-> TRUE, frozen |-> TRUE, grant |-> TRUE,
        run |-> "active", first |-> "none", done |-> FALSE, winner |-> "none",
        audit |-> {}, illegalTake |-> FALSE]
 /\ p=IdlePrep /\ take=IdleTake /\ normal=IdleNormal
 /\ watch=[phase |-> 0, tookBeforePrefix |-> FALSE, prefix |-> FALSE,
           refresh |-> FALSE, shrankWithTail |-> FALSE,
           retainedTail |-> FALSE, abandoned |-> FALSE,
           finalTakeRace |-> FALSE, finalConflict |-> FALSE,
           staleTakeRejected |-> FALSE, stolenEnd |-> FALSE]

(* Original accept remains legal while the frozen Run is active. *)
Accept ==
 /\ s.active /\ 2 \notin s.accepted /\ (Bug#"old-accept-guard" \/ ~s.frozen)
 /\ s'=[s EXCEPT !.root=@+1, !.accepted=@ \cup {2}, !.pending=@ \cup {2}]
 /\ watch'=[watch EXCEPT !.phase=IF @=1 /\ p.stage="scan" /\ p.limit=2 THEN 2 ELSE @]
 /\ UNCHANGED <<p,take,normal>>

(* Agent acceptance and its reverse directory share the original commit.
   The later Session SE35 receipt does not authorize a take or a directory. *)
Admit ==
 /\ s.active /\ s.grant /\ ~HasEnd(s.raw)
 /\ 2 \in s.pending /\ 2 \notin s.admissions
 /\ s'=[s EXCEPT !.root=@+1, !.admissions=@ \cup {2}, !.rels=@ \cup {<<2,1>>}]
 /\ watch'=[watch EXCEPT !.phase=IF @=2 THEN 3 ELSE @]
 /\ UNCHANGED <<p,take,normal>>
Receipt ==
 /\ \E i \in s.admissions \ s.se35 :
      s'=[s EXCEPT !.root=@+1, !.se35=@ \cup {i}]
 /\ UNCHANGED <<p,take,normal,watch>>
PrepareTake ==
 /\ Takes /\ take.stage="idle" /\ s.active /\ s.grant /\ ~HasEnd(s.raw)
 /\ 2 \in s.admissions /\ 2 \notin Taken(s.raw)
 /\ take'=[stage |-> "ready", root |-> s.root]
 /\ UNCHANGED <<s,p,normal,watch>>
PublishTake ==
 /\ take.stage="ready" /\ ~HasEnd(s.raw)
 /\ (Bug="no-take-guard" \/ (take.root=s.root /\ s.active /\ s.grant))
 /\ s'=[s EXCEPT !.root=@+1, !.raw=Append(@,Ev("taken",{2})),
          !.illegalTake=@ \/ ~s.grant \/ ~s.active]
 /\ take'=IdleTake
 /\ watch'=[watch EXCEPT !.tookBeforePrefix=@ \/ (watch.phase=3 /\ ~watch.prefix),
             !.finalTakeRace=@ \/ (p.stage="ready" /\ p.root=s.root)]
 /\ UNCHANGED <<p,normal>>
RejectTake ==
 /\ take.stage="ready" /\ (take.root#s.root \/ ~s.active \/ ~s.grant)
 /\ take'=IdleTake
 /\ watch'=[watch EXCEPT !.staleTakeRejected=@ \/ s.done]
 /\ UNCHANGED <<s,p,normal>>

(* A finite legal tryFinish abstraction: all accepted work is already taken.
   It preserves the last-event rule and does not end over unadmitted pending. *)
AgentEnd ==
 /\ Ends /\ s.active /\ s.grant /\ ~HasEnd(s.raw)
 /\ s.accepted \subseteq Taken(s.raw)
 /\ s'=[s EXCEPT !.root=@+1, !.raw=Append(@,Ev("ended",{}))]
 /\ UNCHANGED <<p,take,normal,watch>>

Capture ==
 /\ p.stage="idle" /\ s.active /\ ~s.done
 /\ p'=[IdlePrep EXCEPT !.stage="dirs", !.root=s.root, !.q=s.pending,
          !.raw=s.raw, !.limit=Cut(s.raw), !.scan=s.cursor]
 /\ watch'=[watch EXCEPT !.phase=IF @=0 /\ s.accepted={1} /\ s.cursor=0 THEN 1 ELSE @]
 /\ UNCHANGED <<s,take,normal>>
ReadDirectory ==
 /\ p.stage="dirs"
 /\ \E i \in p.q \ p.dirs :
      p'=[p EXCEPT !.dirs=@ \cup {i}, !.rels=@ \cup Relations({i},s.rels)]
 /\ UNCHANGED <<s,take,normal,watch>>
DirectoryReady ==
 /\ p.stage="dirs" /\ p.root=s.root /\ p.dirs=p.q
 /\ p'=[p EXCEPT !.stage="scan", !.es=Related(p.q,p.rels)]
 /\ UNCHANGED <<s,take,normal,watch>>
DirectoryConflict ==
 /\ p.stage="dirs" /\ p.root#s.root /\ p'=IdlePrep
 /\ UNCHANGED <<s,take,normal,watch>>
ReadPage ==
 /\ p.stage="scan" /\ p.es={1} /\ p.scan<p.limit
 /\ p'=[p EXCEPT !.scan=@+1]
 /\ UNCHANGED <<s,take,normal,watch>>
RebasePrefix ==
 /\ p.stage="scan" /\ p.root#s.root
 /\ p'=[p EXCEPT !.root=s.root]
 /\ UNCHANGED <<s,take,normal,watch>>
PrefixState(k,raw) ==
 [s EXCEPT !.root=@+1, !.cursor=k, !.effects=@ \cup Need(raw,k),
    !.pending=@ \ Batch(raw,s.cursor,k),
    !.se14=@ \cup {j \in (s.cursor+1)..k : raw[j].kind="taken"},
    !.answers=@ \cup {<<"prefix",k>>}]
PrefixWatch(k,raw) ==
 [watch EXCEPT
   !.prefix=@ \/ (watch.phase=3 /\ p.stage="scan" /\ p.raw=InitialRaw /\ s.cursor=0),
   !.shrankWithTail=@ \/ (p.stage="scan" /\ p.es={1} /\ k<p.limit /\ Batch(raw,s.cursor,k)#{}),
   !.retainedTail=@ \/ (watch.shrankWithTail /\ k>=2),
   !.stolenEnd=@ \/ (\E j \in (s.cursor+1)..k : raw[j].kind="ended")]
PublishPrefix ==
 /\ p.stage="scan" /\ p.es={1} /\ p.root=s.root
 /\ p.scan>s.cursor /\ p.scan<=p.limit
 /\ s'=PrefixState(p.scan,p.raw)
 /\ p'=[p EXCEPT !.root=s.root+1]
 /\ watch'=PrefixWatch(p.scan,p.raw)
 /\ UNCHANGED <<take,normal>>
CapturedDone == p.es={} \/ (p.scan>=p.limit /\ Need(p.raw,p.limit) \subseteq s.effects)
CurrentCapture ==
 /\ p.q=s.pending /\ p.rels=Relations(s.pending,s.rels) /\ p.dirs=p.q
 /\ Related(s.pending,s.rels)={} \/ Cut(s.raw)<=p.limit
Refresh ==
 /\ p.stage="scan" /\ (CapturedDone \/ (Bug="drop-captured" /\ (p.q \ s.pending)#{}))
 /\ p'=IF Bug="old-coverage"
        THEN [p EXCEPT !.stage="ready", !.root=s.root, !.q=s.pending,
                       !.dirs=s.pending, !.rels=Relations(s.pending,s.rels), !.closed=TRUE]
        ELSE IF CurrentCapture THEN [p EXCEPT !.stage="ready", !.root=s.root, !.closed=TRUE]
        ELSE IdlePrep
 /\ watch'=[watch EXCEPT !.abandoned=@ \/ ~CapturedDone,
             !.refresh=@ \/ (watch.prefix /\ p.raw=InitialRaw /\ CapturedDone /\ s.cursor>=2)]
 /\ UNCHANGED <<s,take,normal>>
FinalConflict ==
 /\ p.stage="ready" /\ p.root#s.root /\ p'=IdlePrep
 /\ watch'=[watch EXCEPT !.finalConflict=@ \/ watch.finalTakeRace]
 /\ UNCHANGED <<s,take,normal>>
Covered ==
 /\ p.root=s.root /\ p.closed /\ p.q=s.pending /\ p.dirs=p.q
 /\ p.rels=Relations(s.pending,s.rels)
 /\ Related(s.pending,s.rels)={} \/
    (p.es={1} /\ Cut(s.raw)<=p.limit /\ Need(s.raw,Cut(s.raw)) \subseteq s.effects)
ReleaseState(winner,covered) ==
 LET actual == IF Bug="half-release" THEN {} ELSE s.pending
     outcome == IF winner="normal" THEN "completed" ELSE "cancelled"
 IN [s EXCEPT !.root=@+1,
     !.release=[i \in Inputs |-> s.release[i]+IF i \in actual THEN 1 ELSE 0],
     !.pending=@ \ actual, !.active=FALSE, !.grant=FALSE,
     !.run=outcome, !.first=outcome, !.done=TRUE, !.winner=winner,
     !.answers=@ \cup {<<winner,0>>},
     !.audit=@ \cup {[expected |-> s.pending, actual |-> actual, covered |-> covered]}]
PublishRelease ==
 /\ p.stage="ready" /\ s.active /\ s.frozen /\ s.grant /\ ~s.done
 /\ p.root=s.root \/ Bug="old-root"
 /\ s'=ReleaseState("cancel",Covered)
 /\ p'=[p EXCEPT !.stage="done"]
 /\ UNCHANGED <<take,normal,watch>>

(* Independent normal interpretation can win a terminal race.
   Frontier prefix interpretation never consumes ended itself. *)
ReadNormalPrefix ==
 /\ Normal /\ normal.stage="idle" /\ s.cursor<Cut(s.raw)
 /\ normal'=[stage |-> "ready", root |-> s.root, k |-> s.cursor+1, mode |-> "prefix"]
 /\ UNCHANGED <<s,p,take,watch>>
PublishNormalPrefix ==
 /\ normal.stage="ready" /\ normal.mode="prefix" /\ normal.root=s.root
 /\ s'=PrefixState(normal.k,s.raw) /\ normal'=IdleNormal
 /\ watch'=PrefixWatch(normal.k,s.raw)
 /\ UNCHANGED <<p,take>>
ReadNormalEnd ==
 /\ Normal /\ normal.stage="idle" /\ s.active /\ HasEnd(s.raw)
 /\ Need(s.raw,Cut(s.raw)) \subseteq s.effects
 /\ normal'=[stage |-> "ready", root |-> s.root, k |-> Len(s.raw), mode |-> "ended"]
 /\ UNCHANGED <<s,p,take,watch>>
PublishNormalEnd ==
 /\ normal.stage="ready" /\ normal.mode="ended" /\ normal.root=s.root
 /\ s.active /\ s.grant /\ ~s.done
 /\ s'=[ReleaseState("normal",Need(s.raw,Cut(s.raw)) \subseteq s.effects)
         EXCEPT !.cursor=normal.k, !.effects=@ \cup {normal.k}]
 /\ normal'=IdleNormal
 /\ UNCHANGED <<p,take,watch>>
NormalConflict ==
 /\ normal.stage="ready" /\ normal.root#s.root /\ normal'=IdleNormal
 /\ UNCHANGED <<s,p,take,watch>>

Next == Accept \/ Admit \/ Receipt \/ PrepareTake \/ PublishTake \/ RejectTake \/ AgentEnd
     \/ Capture \/ ReadDirectory \/ DirectoryReady \/ DirectoryConflict
     \/ ReadPage \/ RebasePrefix \/ PublishPrefix \/ Refresh \/ FinalConflict \/ PublishRelease
     \/ ReadNormalPrefix \/ PublishNormalPrefix \/ ReadNormalEnd \/ PublishNormalEnd \/ NormalConflict
TypeOK ==
 /\ s.pending \subseteq s.accepted /\ s.accepted \subseteq Inputs
 /\ s.cursor \in 0..Len(s.raw) /\ Len(s.raw)<=4
 /\ s.run \in {"active","cancelled","completed"}
OriginalDirectory == s.rels={<<i,1>> : i \in s.admissions}
NoFalseRelease == {i \in Inputs : s.release[i]>0} \cap Taken(s.raw)={}
HistoryCoverage == \A a \in s.audit : a.covered
WholeReleaseBatch ==
 /\ \A a \in s.audit : a.expected=a.actual
 /\ s.done => s.pending={}
ReleaseAtMostOnce == \A i \in Inputs : s.release[i]<=1
CapturedPrefixRetained == ~watch.abandoned
CursorSound == Need(s.raw,s.cursor) \subseteq s.effects
ExactBatch == \A j \in s.se14 : s.raw[j].kind="taken" /\ s.raw[j].batch \cap s.pending={}
NoPostTerminalTake == ~s.illegalTake
EndedLast == \A k \in 1..Len(s.raw) : s.raw[k].kind="ended" => k=Len(s.raw)
CancelWindow == ~watch.stolenEnd
TerminalStable == s.first="none" \/ s.run=s.first
Chain == watch.phase=3 /\ watch.prefix /\ watch.refresh /\ watch.shrankWithTail /\ watch.retainedTail
NoTakenWitness == ~(Chain /\ watch.tookBeforePrefix /\ s.done /\ s.winner="cancel"
                     /\ 2 \in Taken(s.raw) /\ 3 \in s.se14 /\ s.release[2]=0 /\ s.se35={})
NoPendingWitness == ~(Chain /\ ~watch.tookBeforePrefix /\ s.done /\ s.winner="cancel"
                       /\ 2 \notin Taken(s.raw) /\ s.release[2]=1 /\ s.se35={})
NoFinalAgentWinner == ~(s.done /\ s.winner="cancel" /\ watch.finalTakeRace /\ watch.finalConflict
                       /\ 2 \in Taken(s.raw) /\ s.release[2]=0)
NoFinalSessionWinner == ~(s.done /\ s.winner="cancel" /\ watch.staleTakeRejected /\ s.release[2]=1)
NoNormalWinner == ~(s.done /\ s.winner="normal" /\ s.accepted=Inputs /\ 2 \in Taken(s.raw))
NoCancelBeforeEnded == ~(s.done /\ s.winner="cancel" /\ HasEnd(s.raw) /\ s.cursor=Len(s.raw)-1
                         /\ watch.shrankWithTail /\ watch.retainedTail)
Spec == Init /\ [][Next]_vars
=============================================================================
