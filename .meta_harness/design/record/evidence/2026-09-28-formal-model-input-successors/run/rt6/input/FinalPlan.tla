---------------------------- MODULE FinalPlan ----------------------------
EXTENDS Naturals
CONSTANTS WithLog, RequireCheck, PinPlan, DistinguishBound
VARIABLES phase, original, current, evidence, measured, checked, anchor,
          sent, sentAmount, refusal
vars == <<phase, original, current, evidence, measured, checked, anchor,
          sent, sentAmount, refusal>>
Cap == 2
Init == /\ phase = "input" /\ original = 0 /\ current = 0
        /\ evidence = "none" /\ measured = 0 /\ checked = FALSE
        /\ anchor = FALSE /\ sent = FALSE /\ sentAmount = 0 /\ refusal = "none"
Choose == /\ phase = "input"
          /\ \E a \in 1..3, e \in {"exact", "bound"}:
               /\ original' = a /\ current' = a /\ evidence' = e
               /\ measured' = IF e = "exact" THEN a ELSE 3
          /\ phase' = "planned"
          /\ UNCHANGED <<checked, anchor, sent, sentAmount, refusal>>
Evaluate == /\ phase = "planned"
            /\ checked' = measured <= Cap
            /\ refusal' = IF measured <= Cap THEN "none"
                          ELSE IF evidence = "exact" \/ ~DistinguishBound
                               THEN "exceeded" ELSE "unavailable"
            /\ phase' = IF measured <= Cap THEN "ready" ELSE "rejected"
            /\ UNCHANGED <<original, current, evidence, measured, anchor, sent, sentAmount>>
MutateCaller == /\ phase \in {"planned", "ready", "anchored"}
                /\ current' \in 1..3
                /\ UNCHANGED <<phase, original, evidence, measured, checked,
                               anchor, sent, sentAmount, refusal>>
Anchor == /\ WithLog /\ ~anchor /\ ~sent
          /\ phase \in {"planned", "ready"}
          /\ (RequireCheck => checked)
          /\ anchor' = TRUE /\ phase' = "anchored"
          /\ UNCHANGED <<original, current, evidence, measured, checked,
                         sent, sentAmount, refusal>>
Send == /\ ~sent /\ phase \in {"planned", "ready", "anchored"}
        /\ (WithLog => anchor) /\ (RequireCheck => checked)
        /\ sent' = TRUE
        /\ sentAmount' = IF PinPlan THEN original ELSE current
        /\ phase' = "sent"
        /\ UNCHANGED <<original, current, evidence, measured, checked, anchor, refusal>>
Next == Choose \/ Evaluate \/ MutateCaller \/ Anchor \/ Send
Spec == Init /\ [][Next]_vars
CheckedBeforeEffects == (anchor \/ sent) => checked
SentFits == sent => sentAmount <= Cap
SameFixedPlan == sent => sentAmount = original
UnknownNotExceeded == evidence = "bound" => refusal # "exceeded"
=============================================================================
