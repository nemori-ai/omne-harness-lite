---------------------------- MODULE Executor ----------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS LeaseCount, JobCount, MaxLeases, QueueCap, QueueBytes,
          LeaseQueueCap, MaxGeneration, BadEarlyReturn, BadLateSuccess, BadStale
Leases == 1..LeaseCount
Jobs == 1..JobCount
Owner(j) == 1 + ((j - 1) % LeaseCount)
Weight(j) == 1 + ((j - 1) % 2)
Bytes(q) == Cardinality({j \in q : Weight(j) = 1}) +
            2 * Cardinality({j \in q : Weight(j) = 2})
VARIABLE st
vars == <<st>>
Live(s) == {l \in Leases : s.leases[l] \in {"active", "releasing"}}
Q(s,l) == {j \in s.queue : Owner(j) = l}
PhysicalCapacity == /\ Cardinality(st.physical) <= 1
                    /\ st.physical # {} => st.worker \in {"counting", "stopping"}
NoLateSuccess == \A j \in st.cancelled : st.answer[j] = "failed"
ReleaseComplete == \A l \in Leases : st.leases[l] = "released" =>
                   /\ l \notin st.cache
                   /\ \A j \in st.physical \cup st.queue : Owner(j) # l
Bounded == /\ Cardinality(Live(st)) <= MaxLeases
           /\ Cardinality(st.queue) <= QueueCap
           /\ Bytes(st.queue) <= QueueBytes
           /\ \A l \in Leases : Cardinality(Q(st,l)) <= LeaseQueueCap
GenerationFence == st.worker \in {"idle","counting","clearing"} => st.initialized
ClosedEmpty == st.host = "closed" =>
               /\ st.worker = "dead" /\ Live(st) = {}
               /\ st.queue = {} /\ st.physical = {} /\ st.cache = {}
TypeOK == /\ st.host \in {"open", "closing", "closed"}
          /\ st.worker \in {"starting", "idle", "counting", "clearing", "stopping", "dead"}
          /\ st.gen \in 1..MaxGeneration
          /\ st.leases \in [Leases -> {"unused", "active", "releasing", "released"}]
          /\ st.queue \subseteq Jobs /\ st.physical \subseteq Jobs
          /\ st.used \subseteq Jobs /\ st.cancelled \subseteq Jobs
          /\ st.answer \in [Jobs -> {"none", "pending", "ok", "failed"}]
          /\ st.cache \subseteq Leases /\ st.clear \in Leases \cup {0}
          /\ st.initialized \in BOOLEAN
Structure == /\ st.cancelled \subseteq st.used
             /\ st.queue \cap st.physical = {}
             /\ st.queue \cup st.physical \subseteq st.used
             /\ \A j \in st.queue : st.leases[Owner(j)] = "active"
             /\ \A j \in st.physical : st.leases[Owner(j)] \in {"active","releasing"}
             /\ st.worker = "counting" => Cardinality(st.physical) = 1
             /\ st.worker = "clearing" =>
                 (st.clear \in Leases /\ st.leases[st.clear] = "releasing")
             /\ st.worker = "dead" => (st.physical = {} /\ st.cache = {})
             /\ st.cache \subseteq Live(st)
             /\ st.host # "open" =>
                 (st.queue = {} /\ st.worker \in {"stopping","dead"} /\
                  ~\E l \in Leases : st.leases[l] = "active")
Init == st = [host |-> "open", worker |-> "starting", gen |-> 1,
              leases |-> [l \in Leases |-> "unused"], queue |-> {}, physical |-> {},
              used |-> {}, cancelled |-> {}, answer |-> [j \in Jobs |-> "none"],
              cache |-> {}, clear |-> 0, initialized |-> FALSE]
Ready == /\ st.host = "open" /\ st.worker = "starting"
         /\ st' = [st EXCEPT !.worker = "idle", !.initialized = TRUE]
Acquire(l) == /\ st.host = "open" /\ st.worker \notin {"dead", "stopping"}
              /\ st.leases[l] = "unused" /\ Cardinality(Live(st)) < MaxLeases
              /\ st' = [st EXCEPT !.leases[l] = "active"]
Submit(j) == /\ st.host = "open" /\ st.leases[Owner(j)] = "active"
             /\ st.worker # "dead" /\ j \notin st.used
             /\ IF st.worker = "idle" /\ st.queue = {}
                   THEN st' = [st EXCEPT !.worker = "counting", !.physical = @ \cup {j},
                                !.cache = @ \cup {Owner(j)}, !.used = @ \cup {j},
                                !.answer[j] = "pending"]
                   ELSE /\ Cardinality(st.queue) < QueueCap
                        /\ Bytes(st.queue) + Weight(j) <= QueueBytes
                        /\ Cardinality(Q(st,Owner(j))) < LeaseQueueCap
                        /\ st' = [st EXCEPT !.queue = @ \cup {j}, !.used = @ \cup {j},
                                     !.answer[j] = "pending"]
Dispatch(j) == /\ st.host = "open" /\ st.worker = "idle" /\ j \in st.queue
               /\ st.leases[Owner(j)] = "active"
               /\ st' = [st EXCEPT !.worker = "counting", !.physical = @ \cup {j},
                            !.cache = @ \cup {Owner(j)}, !.queue = @ \ {j}]
Cancel(j) == /\ j \in st.queue \cup st.physical /\ st.answer[j] = "pending"
             /\ st' = [st EXCEPT !.answer[j] = "failed", !.cancelled = @ \cup {j},
                          !.queue = @ \ {j},
                          !.worker = IF BadEarlyReturn /\ j \in st.physical
                                     THEN "idle" ELSE @]
Release(l) == /\ st.leases[l] = "active"
              /\ LET doomed == Q(st,l) \cup {j \in st.physical : Owner(j) = l}
                 IN st' = [st EXCEPT !.leases[l] = IF st.worker = "dead" THEN "released" ELSE "releasing",
                             !.queue = @ \ Q(st,l), !.cancelled = @ \cup doomed,
                             !.answer = [j \in Jobs |-> IF j \in doomed THEN "failed" ELSE st.answer[j]]]
Counted(j) == /\ st.worker = "counting" /\ j \in st.physical
              /\ st' = [st EXCEPT !.worker = "idle", !.physical = @ \ {j},
                           !.answer[j] = IF BadLateSuccess \/
                             (st.answer[j] = "pending" /\ st.leases[Owner(j)] = "active")
                             THEN "ok" ELSE @]
ClearStart(l) == /\ st.host = "open" /\ st.worker = "idle"
                 /\ st.leases[l] = "releasing"
                 /\ st' = [st EXCEPT !.worker = "clearing", !.clear = l]
ClearAck == /\ st.worker = "clearing"
            /\ st' = [st EXCEPT !.worker = "idle", !.cache = @ \ {st.clear},
                         !.leases[st.clear] = "released", !.clear = 0]
Stop == /\ st.worker \notin {"stopping", "dead"}
        /\ st' = [st EXCEPT !.worker = "stopping", !.cancelled = @ \cup st.physical,
                     !.answer = [j \in Jobs |-> IF j \in st.physical THEN "failed" ELSE st.answer[j]]]
Exit == /\ st.worker # "dead"
        /\ LET replace == st.host = "open" /\ st.gen < MaxGeneration
               doomed == st.physical \cup (IF replace THEN {} ELSE st.queue)
           IN st' = [st EXCEPT !.worker = IF replace THEN "starting" ELSE "dead",
                       !.gen = IF replace THEN @ + 1 ELSE @,
                       !.physical = {}, !.cache = {}, !.clear = 0, !.initialized = FALSE,
                       !.queue = IF replace THEN @ ELSE {}, !.cancelled = @ \cup doomed,
                       !.answer = [j \in Jobs |-> IF j \in doomed THEN "failed" ELSE st.answer[j]],
                       !.leases = [l \in Leases |-> IF st.leases[l] = "releasing"
                                                    THEN "released" ELSE st.leases[l]]]
OldReady(messageGen) == /\ messageGen < st.gen /\ st.worker = "starting"
                        /\ st' = [st EXCEPT !.worker = IF BadStale THEN "idle" ELSE @]
Close == /\ st.host = "open"
         /\ LET doomed == st.queue \cup st.physical
            IN st' = [st EXCEPT !.host = "closing", !.queue = {},
                        !.worker = IF st.worker = "dead" THEN "dead" ELSE "stopping",
                        !.cancelled = @ \cup doomed,
                        !.answer = [j \in Jobs |-> IF j \in doomed THEN "failed" ELSE st.answer[j]],
                        !.leases = [l \in Leases |-> IF st.leases[l] = "active"
                          THEN IF st.worker = "dead" THEN "released" ELSE "releasing" ELSE st.leases[l]]]
CloseDone == /\ st.host = "closing" /\ st.worker = "dead" /\ Live(st) = {}
             /\ st' = [st EXCEPT !.host = "closed"]
Next == Ready \/ (\E l \in Leases : Acquire(l) \/ Release(l) \/ ClearStart(l))
        \/ (\E j \in Jobs : Submit(j) \/ Dispatch(j) \/ Cancel(j) \/ Counted(j))
        \/ ClearAck \/ Stop \/ Exit \/ (\E g \in 1..MaxGeneration : OldReady(g)) \/ Close \/ CloseDone
Spec == Init /\ [][Next]_vars
=============================================================================
