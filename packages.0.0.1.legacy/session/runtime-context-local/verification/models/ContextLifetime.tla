--------------------------- MODULE ContextLifetime ---------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANTS GuardAdmission, GuardBorrow, GuardPhysical, GuardReplacement, GuardReady
Scopes == {"A", "B"}
Jobs == {"init", "read", "write", "projection", "source"}
VARIABLES phase, jobs, seeds, unknownLog, unknownProjection, borrowOpen,
          logOpen, sqlOpen, resourcesReady, generation, violation
vars == <<phase, jobs, seeds, unknownLog, unknownProjection, borrowOpen,
          logOpen, sqlOpen, resourcesReady, generation, violation>>
NoOutstanding == /\ (\A s \in Scopes : jobs[s] = {})
                 /\ unknownLog = {} /\ unknownProjection = {}
Init == /\ phase = "setup" /\ jobs = [s \in Scopes |-> {}] /\ seeds = {}
        /\ unknownLog = {} /\ unknownProjection = {}
        /\ borrowOpen = TRUE /\ logOpen = TRUE /\ sqlOpen = TRUE
        /\ resourcesReady = FALSE /\ generation = 1 /\ violation = FALSE
PrepareResources == /\ phase = "setup" /\ ~resourcesReady
                    /\ resourcesReady' = TRUE
                    /\ UNCHANGED <<phase, jobs, seeds, unknownLog, unknownProjection,
                                   borrowOpen, logOpen, sqlOpen, generation, violation>>
BeginInit(s) == /\ phase = "setup" /\ resourcesReady /\ s \notin seeds
                /\ "init" \notin jobs[s]
                /\ jobs' = [jobs EXCEPT ![s] = @ \cup {"init"}]
                /\ UNCHANGED <<phase, seeds, unknownLog, unknownProjection, borrowOpen,
                               logOpen, sqlOpen, resourcesReady, generation, violation>>
FinishInit(s) == /\ "init" \in jobs[s]
                 /\ borrowOpen /\ logOpen /\ sqlOpen
                 /\ jobs' = [jobs EXCEPT ![s] = @ \ {"init"}] /\ seeds' = seeds \cup {s}
                 /\ UNCHANGED <<phase, unknownLog, unknownProjection, borrowOpen,
                                logOpen, sqlOpen, resourcesReady, generation, violation>>
Publish == /\ resourcesReady
           /\ IF GuardReady THEN phase = "setup" /\ seeds = Scopes
              ELSE phase \in {"setup", "draining", "retained"}
           /\ phase' = "serving"
           /\ violation' = (violation \/ (phase # "setup") \/ (seeds # Scopes))
           /\ UNCHANGED <<jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                          logOpen, sqlOpen, resourcesReady, generation>>
BeginJob(s, kind) ==
  /\ kind \in Jobs \ {"init"} /\ kind \notin jobs[s]
  /\ resourcesReady
  /\ IF GuardAdmission THEN phase = "serving" /\ s \in seeds
     ELSE phase \in {"serving", "draining", "retained"}
  /\ (kind = "write" => s \notin unknownLog)
  /\ (kind = "projection" => s \notin unknownProjection)
  /\ jobs' = [jobs EXCEPT ![s] = @ \cup {kind}]
  /\ violation' = (violation \/ (phase # "serving") \/ (s \notin seeds))
  /\ UNCHANGED <<phase, seeds, unknownLog, unknownProjection, borrowOpen,
                 logOpen, sqlOpen, resourcesReady, generation>>
FinishJob(s, kind) == /\ kind \in jobs[s] /\ kind # "init"
                     /\ borrowOpen /\ logOpen /\ sqlOpen
                     /\ jobs' = [jobs EXCEPT ![s] = @ \ {kind}]
                     /\ UNCHANGED <<phase, seeds, unknownLog, unknownProjection,
                                    borrowOpen, logOpen, sqlOpen, resourcesReady,
                                    generation, violation>>
Unknown(s, kind) ==
  /\ kind \in {"write", "projection"} /\ kind \in jobs[s]
  /\ jobs' = [jobs EXCEPT ![s] = @ \ {kind}]
  /\ unknownLog' = IF kind = "write" THEN unknownLog \cup {s} ELSE unknownLog
  /\ unknownProjection' = IF kind = "projection" THEN unknownProjection \cup {s}
                           ELSE unknownProjection
  /\ UNCHANGED <<phase, seeds, borrowOpen, logOpen, sqlOpen, resourcesReady,
                 generation, violation>>
ResolveLog(s) == /\ s \in unknownLog /\ borrowOpen /\ logOpen
                 /\ unknownLog' = unknownLog \ {s}
                 /\ UNCHANGED <<phase, jobs, seeds, unknownProjection, borrowOpen,
                                logOpen, sqlOpen, resourcesReady, generation, violation>>
ResolveProjection(s) == /\ s \in unknownProjection /\ sqlOpen
                        /\ unknownProjection' = unknownProjection \ {s}
                        /\ UNCHANGED <<phase, jobs, seeds, unknownLog, borrowOpen,
                                       logOpen, sqlOpen, resourcesReady, generation, violation>>
Stop == /\ phase \in {"setup", "serving"} /\ phase' = "draining"
        /\ UNCHANGED <<jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                       logOpen, sqlOpen, resourcesReady, generation, violation>>
Retain == /\ phase = "draining" /\ ~NoOutstanding /\ phase' = "retained"
          /\ UNCHANGED <<jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                         logOpen, sqlOpen, resourcesReady, generation, violation>>
RetryClose == /\ phase = "retained" /\ NoOutstanding /\ phase' = "draining"
              /\ UNCHANGED <<jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                             logOpen, sqlOpen, resourcesReady, generation, violation>>
ReleaseBorrow == /\ phase \in {"draining", "retained"} /\ borrowOpen
                 /\ (GuardBorrow => NoOutstanding)
                 /\ borrowOpen' = FALSE
                 /\ UNCHANGED <<phase, jobs, seeds, unknownLog, unknownProjection,
                                logOpen, sqlOpen, resourcesReady, generation, violation>>
CompleteClose == /\ phase = "draining" /\ NoOutstanding /\ ~borrowOpen
                 /\ phase' = "closed"
                 /\ UNCHANGED <<jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                                logOpen, sqlOpen, resourcesReady, generation, violation>>
ClosePhysical(which) ==
  /\ which \in {"log", "sql"}
  /\ phase \in {"draining", "retained", "closed"}
  /\ (GuardPhysical => phase = "closed" /\ NoOutstanding /\ ~borrowOpen)
  /\ (which = "log" => logOpen) /\ (which = "sql" => sqlOpen)
  /\ logOpen' = IF which = "log" THEN FALSE ELSE logOpen
  /\ sqlOpen' = IF which = "sql" THEN FALSE ELSE sqlOpen
  /\ UNCHANGED <<phase, jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                 resourcesReady, generation, violation>>
Replace ==
  /\ generation = 1
  /\ (GuardReplacement => phase = "closed" /\ NoOutstanding /\ ~logOpen /\ ~sqlOpen)
  /\ generation' = 2
  /\ violation' = (violation \/ (phase # "closed") \/ ~NoOutstanding)
  /\ UNCHANGED <<phase, jobs, seeds, unknownLog, unknownProjection, borrowOpen,
                 logOpen, sqlOpen, resourcesReady>>
Next == PrepareResources \/ Publish \/ Stop \/ Retain \/ RetryClose \/ ReleaseBorrow
        \/ CompleteClose \/ Replace \/ (\E which \in {"log", "sql"} : ClosePhysical(which))
        \/ (\E s \in Scopes : BeginInit(s) \/ FinishInit(s) \/ ResolveLog(s)
                             \/ ResolveProjection(s)
                             \/ (\E kind \in Jobs : BeginJob(s, kind) \/ FinishJob(s, kind)
                                                   \/ Unknown(s, kind)))
TypeOK == /\ phase \in {"setup", "serving", "draining", "retained", "closed"}
          /\ jobs \in [Scopes -> SUBSET Jobs] /\ seeds \subseteq Scopes
          /\ unknownLog \subseteq Scopes /\ unknownProjection \subseteq Scopes
          /\ generation \in 1..2
DependenciesHeld == (~NoOutstanding => borrowOpen /\ logOpen /\ sqlOpen)
ClosedMeansQuiescent == (phase = "closed" => NoOutstanding /\ ~borrowOpen)
NoIllegalAdmissionOrTakeover == ~violation
EventuallyClosesWhenSettled ==
  (phase \in {"draining", "retained"} /\ NoOutstanding) ~> (phase = "closed")
Spec == Init /\ [][Next]_vars
FairSpec == Spec /\ WF_vars(RetryClose) /\ WF_vars(ReleaseBorrow) /\ WF_vars(CompleteClose)
=============================================================================
