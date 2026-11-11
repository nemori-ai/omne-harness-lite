------------------------ MODULE StandingCommit ------------------------
EXTENDS Naturals, FiniteSets, TLC
CONSTANT Mutation
Ops == {1, 2}
VARIABLES live, draining, reserved, released, terminal, sent, valid,
          writeCount, intent, actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid
vars == <<live, draining, reserved, released, terminal, sent, valid,
          writeCount, intent, actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid>>
Init == /\ live = TRUE /\ draining = FALSE
        /\ reserved = {} /\ released = {} /\ sent = {}
        /\ terminal = [o \in Ops |-> "absent"]
        /\ writeCount = [o \in Ops |-> 0]
        /\ valid = TRUE /\ intent = "none" /\ actorValid = TRUE
        /\ phase = "none" /\ phaseValid = TRUE
        /\ admissionValid = TRUE /\ sealed = {} /\ authorizationValid = TRUE
Reserve(o) ==
  /\ live /\ (~draining \/ Mutation = "no_admission_gate")
  /\ o \notin reserved \cup released
  /\ reserved' = reserved \cup {o}
  /\ admissionValid' = (admissionValid /\ ~draining)
  /\ UNCHANGED <<live, draining, released, terminal, sent, valid,
                  writeCount, intent, actorValid, phase, phaseValid, sealed, authorizationValid>>
Send(o) ==
  /\ o \in reserved /\ o \notin sent
  /\ sent' = sent \cup {o}
  /\ UNCHANGED <<live, draining, reserved, released, terminal, valid,
                  writeCount, intent, actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid>>
Commit(o) ==
  /\ o \in sent
  /\ terminal[o] = "absent" \/
     (Mutation = "ignore_seal" /\ terminal[o] = "aborted")
  /\ terminal' = [terminal EXCEPT ![o] = "committed"]
  /\ writeCount' = [writeCount EXCEPT ![o] = @ + 1]
  /\ valid' = (valid /\ live /\ o \in reserved)
  /\ UNCHANGED <<live, draining, reserved, released, sent, intent,
                  actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid>>
Seal(o) ==
  /\ o \in reserved /\ terminal[o] = "absent"
  /\ terminal' = [terminal EXCEPT ![o] = "aborted"]
  /\ sealed' = sealed \cup {o}
  /\ UNCHANGED <<live, draining, reserved, released, sent, valid,
                  writeCount, intent, actorValid, phase, phaseValid, admissionValid, authorizationValid>>
Finish(o) ==
  /\ o \in reserved
  /\ terminal[o] # "absent" \/ Mutation = "timeout_release"
  /\ reserved' = reserved \ {o} /\ released' = released \cup {o}
  /\ UNCHANGED <<live, draining, terminal, sent, valid,
                  writeCount, intent, actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid>>
BeginIntent ==
  /\ intent = "none" /\ actorValid
  /\ intent' = "pending" /\ draining' = TRUE
  /\ UNCHANGED <<live, reserved, released, terminal, sent, valid,
                  writeCount, actorValid, phase, phaseValid, admissionValid, sealed, authorizationValid>>
ExpireActor ==
  /\ actorValid /\ phase = "none" /\ actorValid' = FALSE
  /\ UNCHANGED <<live, draining, reserved, released, terminal, sent,
                  valid, writeCount, intent, phase, phaseValid, admissionValid, sealed, authorizationValid>>
PrepareApply ==
  /\ intent = "pending" /\ reserved = {} /\ phase = "none"
  /\ phase' = "prepared" /\ phaseValid' = IF Mutation = "stale_actor" THEN TRUE ELSE actorValid
  /\ authorizationValid' = (authorizationValid /\ (phaseValid' = actorValid))
  /\ UNCHANGED <<live, draining, reserved, released, terminal, sent,
                  valid, writeCount, intent, actorValid, admissionValid, sealed>>
ApplyIntent ==
  /\ intent = "pending"
  /\ reserved = {} \/ Mutation = "bypass_writer_gate"
  /\ phase = "prepared" \/ Mutation = "bypass_writer_gate"
  /\ intent' = IF (actorValid \/ (Mutation = "stale_actor" /\ phaseValid))
                THEN "applied" ELSE "denied"
  /\ live' = IF intent' = "applied" THEN FALSE ELSE live
  /\ draining' = FALSE
  /\ phase' = "terminal"
  /\ UNCHANGED <<reserved, released, terminal, sent, valid,
                  writeCount, actorValid, phaseValid, admissionValid, sealed, authorizationValid>>
Next == (\E o \in Ops: Reserve(o) \/ Send(o) \/ Commit(o) \/ Seal(o) \/ Finish(o))
        \/ BeginIntent \/ ExpireActor \/ PrepareApply \/ ApplyIntent
Spec == Init /\ [][Next]_vars
TypeOK == /\ live \in BOOLEAN /\ draining \in BOOLEAN
          /\ reserved \subseteq Ops /\ released \subseteq Ops /\ sent \subseteq Ops
          /\ terminal \in [Ops -> {"absent", "committed", "aborted"}]
          /\ writeCount \in [Ops -> 0..1]
          /\ intent \in {"none", "pending", "applied", "denied"}
          /\ phase \in {"none", "prepared", "terminal"}
CurrentAtCommit == valid
TerminalBeforeRelease == \A o \in released : terminal[o] # "absent"
NoHeldAfterRevocation == ~live => reserved = {}
NoNewReservationsDuringDrain == admissionValid
TerminalImmutable == \A o \in sealed : terminal[o] = "aborted"
FreshGovernanceAuthorization == authorizationValid
AtMostOneEffect == \A o \in Ops : writeCount[o] <= 1
=============================================================================
