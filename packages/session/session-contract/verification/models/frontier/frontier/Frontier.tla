---------------------------- MODULE Frontier ----------------------------
EXTENDS Naturals, Integers, Sequences, FiniteSets, TLC

CONSTANTS N, Mode, Shape, Bug, Dynamic, Faults, Normal, Broad
Inputs == 1..N
Local == {1, 2}
Execs == 1..4
Terminal == {"cancelled", "completed", "failed"}
ReleaseModes == {"cancel", "finish", "archive", "ended", "freeze"}
Ev(k, b) == [kind |-> k, batch |-> b, conclusion |-> "none"]
Empty == Ev("silent", {})
TakeEvent(b) == Ev("taken", b)
EndEvent == [Ev("ended", {}) EXCEPT !.conclusion="completed"]
CancelEndEvent == [Ev("ended", {}) EXCEPT !.conclusion="cancelled"]
EffectEvent == Ev("effect", {})
Op(e, k) == <<e, k>>
ControlOp == Op(0, 0)

VARIABLES s, p, normal, take
vars == <<s, p, normal, take>>

Taken(events) == UNION {events[k].batch : k \in 1..Len(events)}
HasEnd(events) == \E k \in 1..Len(events) : events[k].kind = "ended"
Cut(events) == IF HasEnd(events)
              THEN (CHOOSE k \in 1..Len(events) : events[k].kind = "ended") - 1
              ELSE Len(events)
Needs(events, lo, hi) ==
    {k \in (lo+1)..hi : events[k].kind # "silent"}
Pairs(events, e, lo, hi) == {<<e, k>> : k \in Needs(events, lo, hi)}
Batch(events, lo, hi) == UNION {events[k].batch : k \in (lo+1)..hi}
Related(q, rels) == {e \in Local : \E i \in q : <<i, e>> \in rels}
Relations(q, rels) == {r \in rels : r[1] \in q}
Wanted ==
    IF Mode = "successor"
    THEN IF s.pending = {} THEN {} ELSE {CHOOSE i \in s.pending : \A j \in s.pending : i <= j}
    ELSE s.pending
CutFor(events) == IF Bug = "prepare-ended" THEN Len(events) ELSE Cut(events)
InitialEvents ==
    CASE Shape = "taken" -> <<TakeEvent({1})>>
      [] Shape = "batch" -> <<TakeEvent(Inputs)>>
      [] Shape = "tail" -> <<TakeEvent({1}), EffectEvent, Empty, EndEvent>>
      [] Shape = "window" -> <<TakeEvent({1}), EndEvent>>
      [] OTHER -> <<>>
InitialInputs == IF Shape="accept-race" THEN {1} ELSE Inputs
InitialRel == {<<i, 1>> : i \in (IF Shape \in {"taken","tail","window"} THEN {1} ELSE InitialInputs)}
              \cup (IF Shape="multi" THEN {<<i,2>> : i \in Inputs} ELSE {})
InitialRun == IF Mode = "successor" THEN "cancelled" ELSE "active"
InitialPrep ==
    [stage |-> "idle", root |-> 0, q |-> {}, rels |-> {},
     dirs |-> {}, missing |-> {}, es |-> {}, expected |-> {},
     events |-> [e \in Execs |-> <<>>],
     head |-> [e \in Execs |-> 0], confirmed |-> [e \in Execs |-> 0], limits |-> [e \in Execs |-> 0],
     scan |-> [e \in Execs |-> 0], yielded |-> FALSE,
     available |-> TRUE, gap |-> FALSE, closed |-> FALSE]
InitialNormal == [stage |-> "idle", root |-> 0, e |-> 1, k |-> 0,
                  q |-> {}, mode |-> "prefix", head |-> 0]
InitialTake == [stage |-> "idle", root |-> 0, e |-> 1, batch |-> {}]

Init ==
    /\ s = [root |-> 0, accepted |-> InitialInputs, pending |-> InitialInputs,
            rels |-> InitialRel, se35 |-> {},
            raw |-> [e \in Execs |-> CASE e=1 -> InitialEvents
                                           [] e=2 /\ Shape="multi" -> <<EffectEvent,Empty,CancelEndEvent>>
                                           [] e=3 -> <<EffectEvent>>
                                           [] e=4 -> <<TakeEvent({99})>>
                                           [] OTHER -> <<>>],
            head |-> [e \in Execs |-> IF e=1 THEN Len(InitialEvents)+1 ELSE 1],
            cursor |-> [e \in Execs |-> 0], interpreted |-> {},
            se14 |-> {}, release |-> {},
            run |-> [e \in Local |-> IF e=1 THEN InitialRun ELSE IF Shape="multi" THEN "cancelled" ELSE "unstarted"],
            first |-> [e \in Local |-> IF (e=1 /\ Mode="successor") \/ (e=2 /\ Shape="multi") THEN "cancelled" ELSE "none"],
            active |-> IF Mode="successor" THEN 0 ELSE 1,
            activeTaken |-> {}, frozen |-> Mode \in {"cancel","finish","archive","ended"},
            archived |-> FALSE, grant |-> [e \in Local |-> e=1 /\ Mode#"successor"],
            custody |-> {}, cancelledAuth |-> {},
            truth |-> {}, known |-> {}, failed |-> {},
            done |-> FALSE, winner |-> "none", releaseAudit |-> {},
            reads |-> {}, readOutside |-> FALSE, illegalTake |-> FALSE,
            stolen |-> FALSE, historyAltered |-> FALSE,
            tenantRejected |-> {}, lateEnd |-> FALSE,
            shrinkComplete |-> FALSE, querySeen |-> FALSE,
            frozenActive |-> FALSE, abandonedPrefix |-> FALSE, shrankEarly |-> FALSE,
            acceptedAfterReady |-> FALSE, lateWithSuccessor |-> FALSE,
            custodyAfterCancel |-> FALSE, queried |-> {}, badObservation |-> FALSE, foreignReply |-> "none"]
    /\ p = InitialPrep /\ normal = InitialNormal /\ take = InitialTake

Accept ==
    /\ Shape="accept-race" /\ ~s.frozen /\ ~s.archived
    /\ \E i \in Inputs \ s.accepted :
      s'=[s EXCEPT !.root=@+1, !.accepted=@ \cup {i}, !.pending=@ \cup {i},
            !.acceptedAfterReady=@ \/ p.stage="ready"]
    /\ UNCHANGED <<p,normal,take>>

(* Original admission is atomic with its reverse directory. SE35 is separate. *)
Admit ==
    /\ Dynamic /\ s.active \in Local /\ s.grant[s.active]
    /\ \E i \in s.pending :
        /\ <<i,s.active>> \notin s.rels
        /\ s' = [s EXCEPT !.root=@+1, !.rels=@ \cup {<<i,s.active>>}]
    /\ UNCHANGED <<p,normal,take>>

Receipt ==
    /\ Dynamic /\ (Mode#"successor" \/ Broad)
    /\ \E r \in s.rels \ s.se35 :
        s' = [s EXCEPT !.root=@+1, !.se35=@ \cup {r}]
    /\ UNCHANGED <<p,normal,take>>

PrepareTake ==
    /\ Dynamic /\ take.stage="idle"
    /\ \E e \in Local :
      /\ s.grant[e] /\ s.run[e]="active" /\ ~HasEnd(s.raw[e]) /\ Len(s.raw[e]) < 4
      /\ \E b \in SUBSET ({i \in Inputs : <<i,e>> \in s.rels} \ Taken(s.raw[e])) :
        /\ b # {}
        /\ take' = [stage |-> "ready", root |-> s.root, e |-> e, batch |-> b]
    /\ UNCHANGED <<s,p,normal>>

PublishTake ==
    LET e == take.e IN
    /\ take.stage="ready" /\ ~HasEnd(s.raw[e]) /\ Len(s.raw[e]) < 4
    /\ (Bug="no-grant" \/ (take.root=s.root /\ s.grant[e] /\ s.run[e]="active"))
    /\ s' = [s EXCEPT !.root=@+1,
              !.raw[e]=Append(@,TakeEvent(take.batch)), !.head[e]=@+1,
              !.illegalTake=@ \/ ~s.grant[e] \/ s.run[e]#"active"]
    /\ take' = InitialTake
    /\ UNCHANGED <<p,normal>>

RetryTake ==
    /\ take.stage="ready" /\ take.root # s.root
    /\ take' = InitialTake
    /\ UNCHANGED <<s,p,normal>>

AgentEnd ==
    /\ Dynamic /\ (Mode#"successor" \/ Broad)
    /\ \E e \in Local :
      /\ s.grant[e] /\ s.run[e]="active" /\ ~HasEnd(s.raw[e]) /\ Len(s.raw[e]) < 4
      /\ {i \in Inputs : <<i,e>> \in s.rels} \subseteq Taken(s.raw[e])
      /\ s' = [s EXCEPT !.root=@+1, !.raw[e]=Append(@,EndEvent), !.head[e]=@+1]
    /\ UNCHANGED <<p,normal,take>>

Ordinary ==
    /\ Dynamic /\ Broad /\ Shape#"events" /\ s.active \in Local
    /\ LET e == s.active IN
      /\ ~HasEnd(s.raw[e]) /\ s.grant[e] /\ Len(s.raw[e])<4
      /\ \E ev \in {Empty,EffectEvent} :
          s' = [s EXCEPT !.root=@+1, !.raw[e]=Append(@,ev), !.head[e]=@+1]
    /\ UNCHANGED <<p,normal,take>>

LateCustody ==
    /\ Dynamic /\ (Mode#"successor" \/ Broad)
    /\ \E e \in {1,3} \ s.custody :
        s' = [s EXCEPT !.root=@+1, !.head[e]=@+1, !.custody=@ \cup {e},
                   !.custodyAfterCancel=@ \/ (e=1 /\ s.run[1]="cancelled")]
    /\ UNCHANGED <<p,normal,take>>

TwoEvents ==
    /\ Dynamic /\ Shape="events" /\ s.active=1 /\ s.grant[1]
    /\ ~HasEnd(s.raw[1]) /\ Len(s.raw[1])<=2
    /\ s'=[s EXCEPT !.root=@+1,!.raw[1]=Append(Append(@,Empty),EffectEvent),!.head[1]=@+1]
    /\ UNCHANGED <<p,normal,take>>

CancelAuthority ==
    /\ \E e \in Local :
      /\ s.run[e]="cancelled" /\ e \notin s.cancelledAuth
      /\ s' = [s EXCEPT !.cancelledAuth=@ \cup {e}]
    /\ UNCHANGED <<p,normal,take>>

AgentCancelEnd ==
    /\ 1 \in s.cancelledAuth /\ s.run[1]="cancelled"
    /\ ~HasEnd(s.raw[1]) /\ Len(s.raw[1])<4
    /\ s'=[s EXCEPT !.root=@+1, !.raw[1]=Append(@,CancelEndEvent), !.head[1]=@+1]
    /\ UNCHANGED <<p,normal,take>>

FreezeActive ==
    /\ Mode="freeze" /\ s.active=1 /\ ~s.frozen /\ ~s.frozenActive
    /\ s' = [s EXCEPT !.root=@+1, !.frozen=TRUE, !.frozenActive=TRUE]
    /\ UNCHANGED <<p,normal,take>>

PlainCancel ==
    /\ Mode \in {"freeze","plain"} /\ s.active=1 /\ ~s.frozen
    /\ s' = [s EXCEPT !.root=@+1, !.run[1]="cancelled", !.first[1]="cancelled",
              !.grant[1]=FALSE, !.active=0, !.activeTaken={},
              !.winner="plain-cancel"]
    /\ UNCHANGED <<p,normal,take>>

CanBegin ==
    /\ ~s.done /\ s.truth \ s.known = {}
    /\ IF Mode="freeze" THEN s.active=0 /\ ~s.frozen
       ELSE IF Mode="successor" THEN s.active=0 /\ ~s.frozen
       ELSE Mode \in {"cancel","finish","archive","ended"} /\ s.active=1

Capture ==
    /\ p.stage="idle" /\ CanBegin
    /\ p' = [InitialPrep EXCEPT !.stage="dirs", !.root=s.root, !.q=Wanted,
              !.events=s.raw, !.head=s.head, !.scan=s.cursor, !.confirmed=s.cursor,
              !.limits=[e \in Execs |-> CutFor(s.raw[e])]]
    /\ UNCHANGED <<s,normal,take>>

ReadDirectory ==
    /\ p.stage="dirs" /\ p.available /\ ~p.gap
    /\ \E i \in p.q \ p.dirs :
      \E missing \in (IF Faults \/ Bug="missing-empty" THEN {TRUE,FALSE} ELSE {FALSE}) :
       /\ p' = [p EXCEPT !.dirs=@ \cup {i},
                 !.rels=@ \cup (IF missing THEN {} ELSE Relations({i},s.rels)),
                 !.missing=IF missing THEN @ \cup {i} ELSE @]
    /\ UNCHANGED <<s,normal,take>>

ResolveMissing ==
    /\ p.missing # {} /\ p.available /\ ~p.gap
    /\ p' = [p EXCEPT !.dirs=@ \ p.missing, !.missing={}]
    /\ UNCHANGED <<s,normal,take>>

DirectoryReady ==
    /\ p.stage="dirs" /\ p.dirs=p.q
    /\ (p.missing={} \/ Bug="missing-empty") /\ p.root=s.root
    /\ p' = [p EXCEPT !.stage="scan",
              !.es=Related(p.q,p.rels) \cup (IF Bug="scan-old" THEN {3} ELSE {}),
              !.expected=Related(p.q,s.rels)]
    /\ UNCHANGED <<s,normal,take>>

DirectoryConflict ==
    /\ p.stage="dirs" /\ p.root#s.root
    /\ p' = [InitialPrep EXCEPT !.stage="idle"]
    /\ UNCHANGED <<s,normal,take>>

ReadPage ==
    /\ p.stage="scan" /\ p.available /\ ~p.gap /\ ~p.yielded
    /\ \E e \in p.es :
      /\ p.scan[e] < p.limits[e]
      /\ p' = [p EXCEPT !.scan[e]=@+1]
      /\ s' = [s EXCEPT !.reads=@ \cup {e},
                !.readOutside=@ \/ e \notin p.expected]
    /\ UNCHANGED <<normal,take>>

Yield ==
    /\ Faults /\ p.stage="scan" /\ ~p.yielded
    /\ p' = [p EXCEPT !.yielded=TRUE]
    /\ UNCHANGED <<s,normal,take>>
Resume ==
    /\ p.yielded
    /\ p' = [p EXCEPT !.yielded=FALSE]
    /\ UNCHANGED <<s,normal,take>>
Unavailable ==
    /\ Faults /\ p.stage \in {"dirs","scan"} /\ p.available
    /\ p' = [p EXCEPT !.available=FALSE]
    /\ UNCHANGED <<s,normal,take>>
Available ==
    /\ ~p.available /\ p'=[p EXCEPT !.available=TRUE]
    /\ UNCHANGED <<s,normal,take>>
Gap ==
    /\ Faults /\ p.stage="scan" /\ ~p.gap
    /\ p'=[p EXCEPT !.gap=TRUE]
    /\ UNCHANGED <<s,normal,take>>

(* Prefix publication uses a fresh root while reusing immutable source bytes. *)
RebasePrefix ==
    /\ p.stage="scan" /\ p.root#s.root
    /\ p' = [p EXCEPT !.root=s.root, !.head=s.head]
    /\ UNCHANGED <<s,normal,take>>

PrefixState(e,k,events,head,lost) ==
    LET keys == Pairs(events,e,s.cursor[e],k)
        b == IF Bug="partial-batch" THEN Batch(events,s.cursor[e],k) \cap p.q
             ELSE Batch(events,s.cursor[e],k)
        stole == \E j \in (s.cursor[e]+1)..k : events[j].kind="ended"
        terminal == IF stole /\ s.run[e]="active" THEN "completed" ELSE s.run[e]
    IN [s EXCEPT !.root=@+1, !.cursor[e]=k,
         !.interpreted=@ \cup keys,
         !.se14=@ \cup {<<e,j>> : j \in {t \in (s.cursor[e]+1)..k : events[t].kind="taken"}},
         !.pending=@ \ b,
         !.shrankEarly=@ \/ (p.stage="scan" /\ e \in p.es /\ k<p.limits[e] /\ (s.pending \ b)#p.q),
         !.activeTaken=IF s.active=e THEN @ \cup b ELSE @,
         !.run[e]=terminal,
         !.first[e]=IF stole /\ @="none" THEN "completed" ELSE @,
         !.grant[e]=IF stole THEN FALSE ELSE @,
         !.active=IF stole /\ @=e THEN 0 ELSE @,
         !.stolen=@ \/ (stole /\ s.run[e]="active"),
         !.badObservation=@ \/ ((IF Bug="revision-cursor" THEN k ELSE head)#head)
                             \/ (k>Len(events)),
         !.truth=@ \cup {Op(e,k)},
         !.known=IF lost THEN @ ELSE @ \cup {Op(e,k)}]

PublishPrefix ==
    /\ p.stage="scan" /\ p.available /\ ~p.gap /\ ~p.yielded
    /\ p.root=s.root /\ s.truth \ s.known = {}
    /\ \E e \in p.es \cap Local :
      /\ p.scan[e] > s.cursor[e]
      /\ Needs(p.events[e],s.cursor[e],p.scan[e]) # {}
      /\ \E lost \in (IF Faults THEN {TRUE,FALSE} ELSE {FALSE}) :
        /\ s' = IF Bug="cursor-first"
                THEN [s EXCEPT !.root=@+1, !.cursor[e]=p.scan[e]]
                ELSE PrefixState(e,p.scan[e],p.events[e],p.head[e],lost)
        /\ p' = [p EXCEPT !.root=s.root+1,
                  !.confirmed[e]=IF lost THEN @ ELSE p.scan[e]]
    /\ UNCHANGED <<normal,take>>

CapturedDone ==
    \A e \in p.es :
      /\ p.scan[e] >= p.limits[e]
      /\ Pairs(p.events[e],e,0,p.limits[e]) \subseteq s.interpreted

CurrentCapture ==
    /\ p.q=Wanted /\ (p.rels=Relations(Wanted,s.rels) \/ Bug="missing-empty")
    /\ \A e \in Related(Wanted,s.rels) : Cut(s.raw[e]) <= p.limits[e]

Refresh ==
    /\ p.stage="scan" /\ (CapturedDone \/ (Bug="drop-captured" /\ p.q#Wanted)) /\ s.truth \ s.known={}
    /\ p.available /\ ~p.gap
    /\ p' = IF CurrentCapture
            THEN [p EXCEPT !.stage="ready", !.root=s.root, !.closed=TRUE]
            ELSE [InitialPrep EXCEPT !.stage="idle"]
    /\ s' = [s EXCEPT !.shrinkComplete=@ \/ (p.q#Wanted /\ p.es#{}),
            !.abandonedPrefix=@ \/ ~CapturedDone]
    /\ UNCHANGED <<normal,take>>

Bypass ==
    /\ Bug \in {"no-prefix","successor"} /\ p.stage="scan"
    /\ p'=[p EXCEPT !.stage="ready", !.root=s.root]
    /\ UNCHANGED <<s,normal,take>>

FinalConflict ==
    /\ p.stage="ready" /\ p.root#s.root
    /\ p' = InitialPrep
    /\ UNCHANGED <<s,normal,take>>

ReleaseState(outcome,which,q,coverage,lost) ==
    LET released == IF Bug="half-batch" THEN {} ELSE q
        operation == IF which="normal" THEN Op(1,Len(s.raw[1])) ELSE ControlOp
        newTerm == IF which="freeze" THEN s.run[1] ELSE outcome
    IN [s EXCEPT !.root=@+1, !.release=@ \cup released, !.pending=@ \ released,
         !.run[1]=newTerm,
         !.first[1]=IF @="none" THEN newTerm ELSE @,
         !.active=0, !.activeTaken={}, !.grant[1]=FALSE,
         !.frozen=TRUE, !.archived=which="archive" \/ s.archived,
         !.truth=@ \cup {operation},
         !.known=IF lost THEN @ ELSE @ \cup {operation},
         !.done=TRUE, !.winner=which,
         !.releaseAudit=@ \cup {[expected |-> q, actual |-> released, covered |-> coverage]}]

PublishRelease ==
    /\ Mode \in ReleaseModes /\ p.stage="ready" /\ ~s.done
    /\ s.truth \ s.known = {}
    /\ (p.root=s.root \/ Bug="no-root")
    /\ IF Mode="freeze" THEN s.active=0 /\ ~s.frozen ELSE s.active=1 /\ s.frozen
    /\ (Mode#"ended" \/ (HasEnd(s.raw[1]) /\
          Pairs(s.raw[1],1,0,Cut(s.raw[1])) \subseteq s.interpreted))
    /\ \E lost \in (IF Faults THEN {TRUE,FALSE} ELSE {FALSE}) :
      LET outcome == CASE Mode="finish" -> "failed"
                       [] Mode="ended" -> "completed"
                       [] OTHER -> "cancelled"
          coverage == p.missing={} /\ p.rels=Relations(p.q,s.rels) /\ p.q=s.pending /\ p.closed
      IN s' = IF Mode="ended"
              THEN [ReleaseState(outcome,Mode,s.pending,coverage,lost)
                    EXCEPT !.cursor[1]=Len(s.raw[1]),
                           !.interpreted=@ \cup {<<1,Len(s.raw[1])>>}]
              ELSE ReleaseState(outcome,Mode,s.pending,coverage,lost)
    /\ p'=[p EXCEPT !.stage="done"]
    /\ UNCHANGED <<normal,take>>

StartSuccessor ==
    /\ Mode="successor" /\ p.stage="ready" /\ ~s.done /\ s.active=0
    /\ (p.root=s.root \/ Bug="no-root") /\ s.truth\s.known={}
    /\ Wanted # {}
    /\ s'=[s EXCEPT !.root=@+1, !.active=2, !.run[2]="active",
           !.grant[2]=TRUE, !.rels=@ \cup {<<i,2>> : i \in Wanted},
           !.done=TRUE, !.activeTaken={},
           !.truth=@ \cup {ControlOp}, !.known=@ \cup {ControlOp}]
    /\ p'=[p EXCEPT !.stage="done"]
    /\ UNCHANGED <<normal,take>>

(* Independent normal interpreter. Reads and commits are distinct actions. *)
ReadNormalPrefix ==
    /\ Normal /\ normal.stage="idle"
    /\ \E e \in Local :
      \E k \in (s.cursor[e]+1)..Cut(s.raw[e]) :
        /\ Needs(s.raw[e],s.cursor[e],k)#{} /\ k<=s.cursor[e]+1
        /\ normal'=[stage |-> "ready",root |-> s.root,e |-> e,k |-> k,
                    q |-> {},mode |-> "prefix",head |-> s.head[e]]
    /\ UNCHANGED <<s,p,take>>

PublishNormalPrefix ==
    /\ normal.stage="ready" /\ normal.mode="prefix" /\ normal.root=s.root
    /\ s.truth\s.known={}
    /\ s'=PrefixState(normal.e,normal.k,s.raw[normal.e],normal.head,FALSE)
    /\ normal'=InitialNormal
    /\ UNCHANGED <<p,take>>

ReadNormalEnd ==
    /\ Normal /\ normal.stage="idle" /\ HasEnd(s.raw[1]) /\ s.run[1]="active"
    /\ Pairs(s.raw[1],1,0,Cut(s.raw[1])) \subseteq s.interpreted
    /\ (~s.frozen \/ \A e \in Related(s.pending,s.rels) :
           Pairs(s.raw[e],e,0,Cut(s.raw[e])) \subseteq s.interpreted)
    /\ normal'=[stage |-> "ready",root |-> s.root,e |-> 1,
                k |-> Len(s.raw[1]),q |-> s.pending,mode |-> "ended",head |-> s.head[1]]
    /\ UNCHANGED <<s,p,take>>

PublishNormalEnd ==
    /\ normal.stage="ready" /\ normal.mode="ended" /\ normal.root=s.root
    /\ s.run[1]="active" /\ s.truth\s.known={}
    /\ s'=IF s.frozen
          THEN [ReleaseState("completed","normal",normal.q,TRUE,FALSE)
                EXCEPT !.cursor[1]=normal.k, !.interpreted=@ \cup {<<1,normal.k>>}]
          ELSE [s EXCEPT !.root=@+1,! .run[1]="completed",!.first[1]="completed",
                  !.grant[1]=FALSE,!.active=0,!.activeTaken={},
                  !.cursor[1]=normal.k,!.interpreted=@ \cup {<<1,normal.k>>},
                  !.winner="normal"]
    /\ normal'=InitialNormal
    /\ UNCHANGED <<p,take>>

NormalConflict ==
    /\ normal.stage="ready" /\ normal.root#s.root
    /\ normal'=InitialNormal
    /\ UNCHANGED <<s,p,take>>

InterpretLateEnd ==
    /\ HasEnd(s.raw[1]) /\ s.run[1] \in Terminal /\ ~s.lateEnd /\ s.cursor[1]<Len(s.raw[1])
    /\ Pairs(s.raw[1],1,0,Cut(s.raw[1])) \subseteq s.interpreted
    /\ s'=[s EXCEPT !.root=@+1,!.cursor[1]=Len(s.raw[1]),
            !.interpreted=@ \cup {<<1,Len(s.raw[1])>>},!.lateEnd=TRUE,
            !.truth=@ \cup {Op(1,Len(s.raw[1]))},!.known=@ \cup {Op(1,Len(s.raw[1]))},
            !.lateWithSuccessor=@ \/ (s.active=2 /\ s.activeTaken#{}),
            !.activeTaken=IF Bug="history-clear" THEN {} ELSE @,
            !.historyAltered=@ \/ (Bug="history-clear" /\ s.active=2 /\ s.activeTaken#{})]
    /\ UNCHANGED <<p,normal,take>>

FailBefore ==
    /\ Faults /\ p.stage \in {"scan","ready"}
    /\ \E op \in {ControlOp} \cup {Op(e,p.scan[e]) : e \in p.es} :
      /\ op \notin s.truth \cup s.failed
      /\ s'=[s EXCEPT !.failed=@ \cup {op}]
    /\ UNCHANGED <<p,normal,take>>

Query ==
    /\ \E op \in s.truth \ s.known :
      /\ s'=[s EXCEPT !.known=@ \cup {op},!.querySeen=TRUE,!.queried=@ \cup {op}]
      /\ p'=IF op[1] \in Local
            THEN [p EXCEPT !.confirmed[op[1]]=op[2]]
            ELSE p
    /\ UNCHANGED <<normal,take>>

Tenant(e) == IF e=4 THEN "foreign" ELSE "local"
ForeignAttempt ==
    /\ s.tenantRejected={} /\ (Faults \/ Bug="foreign")
    /\ Tenant(4)#"local"
    /\ s'=IF Bug="foreign"
          THEN [s EXCEPT !.se14=@ \cup {<<4,1>>},!.cursor[4]=1,
                 !.tenantRejected={"attempted"},!.foreignReply="accepted"]
          ELSE [s EXCEPT !.tenantRejected={"directory","event","source","prep","query"},
                 !.foreignReply="denied"]
    /\ UNCHANGED <<p,normal,take>>

Next == Accept \/ TwoEvents \/ AgentCancelEnd \/ Admit \/ Receipt \/ PrepareTake \/ PublishTake \/ RetryTake \/ AgentEnd
     \/ Ordinary \/ LateCustody \/ CancelAuthority \/ FreezeActive \/ PlainCancel
     \/ Capture \/ ReadDirectory \/ ResolveMissing \/ DirectoryReady
     \/ DirectoryConflict \/ ReadPage \/ Yield \/ Resume \/ Unavailable
     \/ Available \/ Gap \/ RebasePrefix \/ PublishPrefix \/ Refresh \/ Bypass
     \/ FinalConflict \/ PublishRelease \/ StartSuccessor
     \/ ReadNormalPrefix \/ PublishNormalPrefix \/ ReadNormalEnd \/ PublishNormalEnd
     \/ NormalConflict \/ InterpretLateEnd \/ FailBefore \/ Query \/ ForeignAttempt

TypeOK ==
    /\ s.pending \subseteq Inputs /\ s.release \subseteq Inputs
    /\ \A e \in Execs : Len(s.raw[e])<=4 /\ s.cursor[e] \in 0..Len(s.raw[e])
    /\ \A e \in Local : s.run[e] \in Terminal \cup {"active","unstarted"}

NoFalseRelease == s.release \cap UNION {Taken(s.raw[e]) : e \in Local} = {}
AtMostOneTake == \A i \in Inputs :
    Cardinality({e \in Local : i \in Taken(s.raw[e])}) <= 1
ExactBatch == \A pair \in s.se14 :
    /\ s.raw[pair[1]][pair[2]].kind="taken"
    /\ s.raw[pair[1]][pair[2]].batch \cap s.pending={}
TerminalStable == \A e \in Local : s.first[e]="none" \/ s.run[e]=s.first[e]
CancelWindow == ~s.stolen
NoPostTerminalTake == ~s.illegalTake
WholeReleaseBatch ==
    /\ \A r \in s.releaseAudit : r.expected=r.actual
    /\ (s.frozen /\ s.active=0 => s.pending={})
CursorSound == \A e \in Local :
    Pairs(s.raw[e],e,0,s.cursor[e]) \subseteq s.interpreted
HistoryCoverage == \A r \in s.releaseAudit : r.covered
RelevantReads == ~s.readOutside
TenantSeparation ==
    /\ s.pending \subseteq Inputs /\ s.release \subseteq Inputs
    /\ s.cursor[4]=0 /\ s.raw[4]= <<TakeEvent({99})>>
    /\ \A pair \in s.se14 : pair[1] \in Local
HeadCursorSeparate ==
    /\ \A e \in Local : s.cursor[e]<=Len(s.raw[e])
    /\ ~s.badObservation
UnknownSound ==
    /\ s.known \subseteq s.truth
    /\ \A e \in Local : p.confirmed[e]<=s.cursor[e]
SuccessorUnaffected == ~s.historyAltered
NoCancelWindowWitness == ~(s.winner="cancel" /\ s.run[1]="cancelled" /\ s.lateEnd)
NoIndependentWinner == ~(s.winner="normal" /\ s.run[1]="completed")
CapturedPrefixRetained == ~s.abandonedPrefix
NoShrinkWitness == ~(s.shrinkComplete /\ s.shrankEarly)
NoRecoveryWitness == ~(s.done /\ ControlOp \in s.known /\ s.failed \cap s.queried#{})
NoPostCancelCustodyWitness == ~(s.run[1]="cancelled" /\ s.custodyAfterCancel /\ 1 \in s.cancelledAuth)
NoPlainCancelWitness == ~(s.winner="plain-cancel" /\ s.cursor[1]=0 /\ Taken(s.raw[1])#{})
NoActiveFreezeWitness == ~(s.frozenActive /\ s.active=1 /\ s.cursor[1]=0 /\ Taken(s.raw[1])#{})
NoAcceptRaceWitness == ~(s.done /\ s.release=Inputs /\ s.accepted=Inputs /\ s.acceptedAfterReady)
NoTwoRunsWitness == ~(s.active=2 /\ Taken(s.raw[2])#{} /\ s.lateWithSuccessor)
NoEventCountWitness == ~(s.head[1]<Len(s.raw[1]) /\ s.cursor[1]>0)
Spec == Init /\ [][Next]_vars
=============================================================================
