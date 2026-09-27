--------------------------- MODULE Adaptation ---------------------------
EXTENDS Naturals

CONSTANT GuardAcquire, GuardDispose, PinBinding
VARIABLES registered, retired, disposed, profiles, phase, bound, original,
          cancelled, acquiredRetired, publication, failedAdoption

Versions == {1, 2}
Consumers == {"runtime", "direct"}
Scopes == {"official", "custom"}
vars == <<registered, retired, disposed, profiles, phase, bound, original,
          cancelled, acquiredRetired, publication, failedAdoption>>

Init == /\ registered = {1} /\ retired = {} /\ disposed = {}
        /\ profiles = [s \in Scopes |-> 1]
        /\ phase = [c \in Consumers |-> "idle"]
        /\ bound = [c \in Consumers |-> 0]
        /\ original = [c \in Consumers |-> 0]
        /\ cancelled = {} /\ acquiredRetired = {}
        /\ publication = "new" /\ failedAdoption = FALSE

Register == /\ publication \in {"new", "failed"}
            /\ registered' = registered \cup {2} /\ publication' = "registered"
            /\ UNCHANGED <<retired, disposed, profiles, phase, bound, original,
                           cancelled, acquiredRetired, failedAdoption>>
RegisterFailure == /\ publication = "new" /\ publication' = "failed"
                   /\ UNCHANGED <<registered, retired, disposed, profiles, phase,
                                  bound, original, cancelled, acquiredRetired,
                                  failedAdoption>>
Adopt(s) == /\ 2 \in registered /\ profiles[s] = 1
            /\ profiles' = [profiles EXCEPT ![s] = 2]
            /\ bound' = IF PinBinding THEN bound ELSE
                           [c \in Consumers |-> IF phase[c] = "busy" THEN 2 ELSE bound[c]]
            /\ UNCHANGED <<registered, retired, disposed, phase, original,
                           cancelled, acquiredRetired, publication, failedAdoption>>
AdoptFailure == /\ 2 \in registered /\ ~failedAdoption
                /\ failedAdoption' = TRUE
                /\ UNCHANGED <<registered, retired, disposed, profiles, phase,
                               bound, original, cancelled, acquiredRetired, publication>>

Acquire(c, s) == LET v == profiles[s] IN
                /\ phase[c] = "idle" /\ v \in registered /\ v \notin disposed
                /\ (GuardAcquire => v \notin retired)
                /\ phase' = [phase EXCEPT ![c] = "busy"]
                /\ bound' = [bound EXCEPT ![c] = v]
                /\ original' = [original EXCEPT ![c] = v]
                /\ acquiredRetired' = IF v \in retired
                     THEN acquiredRetired \cup {c} ELSE acquiredRetired
                /\ UNCHANGED <<registered, retired, disposed, profiles, cancelled,
                               publication, failedAdoption>>
Unavailable(c, s) == /\ phase[c] = "idle"
                      /\ profiles[s] \in (retired \cup disposed)
                      /\ phase' = [phase EXCEPT ![c] = "rejected"]
                      /\ UNCHANGED <<registered, retired, disposed, profiles, bound,
                                     original, cancelled, acquiredRetired, publication,
                                     failedAdoption>>
Retire(v) == /\ v \in registered /\ v \notin retired
             /\ retired' = retired \cup {v}
             /\ UNCHANGED <<registered, disposed, profiles, phase, bound, original,
                            cancelled, acquiredRetired, publication, failedAdoption>>
Force(v) == /\ v \in retired
            /\ \E c \in Consumers : phase[c] = "busy" /\ bound[c] = v /\ c \notin cancelled
            /\ cancelled' = cancelled \cup
                  {c \in Consumers : phase[c] = "busy" /\ bound[c] = v}
            /\ UNCHANGED <<registered, retired, disposed, profiles, phase, bound,
                           original, acquiredRetired, publication, failedAdoption>>
Stop(c) == /\ phase[c] = "busy"
           /\ phase' = [phase EXCEPT ![c] = "stopped"]
           /\ UNCHANGED <<registered, retired, disposed, profiles, bound, original,
                          cancelled, acquiredRetired, publication, failedAdoption>>
Release(c) == /\ phase[c] = "stopped"
              /\ phase' = [phase EXCEPT ![c] = "released"]
              /\ UNCHANGED <<registered, retired, disposed, profiles, bound, original,
                             cancelled, acquiredRetired, publication, failedAdoption>>
HasLease(c, v) == phase[c] \in {"busy", "stopped"} /\ bound[c] = v
Dispose(v) == /\ v \in retired /\ v \notin disposed
              /\ (GuardDispose => ~\E c \in Consumers : HasLease(c, v))
              /\ disposed' = disposed \cup {v}
              /\ UNCHANGED <<registered, retired, profiles, phase, bound, original,
                             cancelled, acquiredRetired, publication, failedAdoption>>

Next == Register \/ RegisterFailure \/ AdoptFailure
        \/ (\E s \in Scopes : Adopt(s))
        \/ (\E c \in Consumers, s \in Scopes : Acquire(c, s) \/ Unavailable(c, s))
        \/ (\E v \in Versions : Retire(v) \/ Force(v) \/ Dispose(v))
        \/ (\E c \in Consumers : Stop(c) \/ Release(c))
Spec == Init /\ [][Next]_vars
        /\ (\A c \in Consumers : WF_vars(Stop(c)) /\ WF_vars(Release(c)))
        /\ (\A v \in Versions : WF_vars(Dispose(v)))

TypeOK == /\ registered \subseteq Versions /\ retired \subseteq registered
          /\ disposed \subseteq retired /\ profiles \in [Scopes -> Versions]
          /\ phase \in [Consumers -> {"idle", "busy", "stopped", "released", "rejected"}]
          /\ bound \in [Consumers -> 0..2] /\ original \in [Consumers -> 0..2]
          /\ cancelled \subseteq Consumers /\ acquiredRetired \subseteq Consumers
          /\ publication \in {"new", "failed", "registered"} /\ failedAdoption \in BOOLEAN
NoAcquireRetired == acquiredRetired = {}
NoDisposeWithLease == \A c \in Consumers, v \in disposed : ~HasLease(c, v)
BindingPinned == \A c \in Consumers : phase[c] \in {"busy", "stopped", "released"}
                                           => bound[c] = original[c]
AdoptionFailureKeepsProfiles == [](~failedAdoption /\ failedAdoption' => profiles' = profiles)
RegistrationDoesNotAdopt == [](registered' # registered => profiles' = profiles)
CancelledEventuallyReleased == \A c \in Consumers : (c \in cancelled) ~> (phase[c] = "released")
DrainedEventuallyDisposed == \A v \in Versions :
     (v \in retired /\ ~\E c \in Consumers : HasLease(c, v)) ~> (v \in disposed)
=============================================================================
