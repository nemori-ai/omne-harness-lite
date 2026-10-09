---------------------------- MODULE FinalPlan ----------------------------
EXTENDS Naturals
CONSTANTS WithLog, RequireCheck, PinPlan, DistinguishBound,
          AllowEstimate, ApplyMargin, HonestEstimate, MissingFirst,
          EnforceBytes, PreserveUsage
VARIABLES phase, original, current, evidence, measured, multiplierTwice,
          reserve, capPresent, marginValid, bytes, admission, evaluated,
          checked, anchor, sent, sentAmount, refusal, basis, usage, reported
vars == <<phase, original, current, evidence, measured, multiplierTwice,
          reserve, capPresent, marginValid, bytes, admission, evaluated,
          checked, anchor, sent, sentAmount, refusal, basis, usage, reported>>
Cap == 2
CeilHalf(n) == (n + 1) \div 2
ExpectedAdmission == IF evidence = "estimate"
                     THEN CeilHalf(measured * multiplierTwice) + reserve
                     ELSE measured
HasMeasure == evidence # "none"
TokenOver == HasMeasure /\ ExpectedAdmission > Cap
ActualOver == (evidence = "exact" /\ measured > Cap) \/ bytes > Cap
EstimatedOver == evidence = "estimate" /\ ExpectedAdmission > Cap
Eligible == capPresent /\ marginValid /\ HasMeasure /\ ~TokenOver /\ bytes <= Cap

Init == /\ phase = "input" /\ original = 0 /\ current = 0
        /\ evidence = "none" /\ measured = 0 /\ multiplierTwice = 2
        /\ reserve = 0 /\ capPresent = TRUE /\ marginValid = TRUE
        /\ bytes = 0 /\ admission = 0 /\ evaluated = FALSE /\ checked = FALSE
        /\ anchor = FALSE /\ sent = FALSE /\ sentAmount = 0
        /\ refusal = "none" /\ basis = "none" /\ usage = [known |-> FALSE, value |-> 0] /\ reported = [known |-> FALSE, value |-> 0]
Choose ==
  /\ phase = "input"
  /\ \E a \in 1..3, e \in {"exact", "bound", "estimate", "none"},
         m \in 1..3, factor \in {2,3}, extra \in {0,1},
         hasCap \in BOOLEAN, validPolicy \in BOOLEAN, byteCount \in 1..3:
       /\ (e = "bound" => m >= a)
       /\ original' = a /\ current' = a /\ evidence' = e
       /\ measured' = IF e = "exact" THEN a ELSE m
       /\ multiplierTwice' = factor /\ reserve' = extra
       /\ capPresent' = hasCap /\ marginValid' = validPolicy /\ bytes' = byteCount
  /\ phase' = "planned"
  /\ UNCHANGED <<admission, evaluated, checked, anchor, sent, sentAmount, refusal, basis, usage, reported>>
Evaluate ==
  /\ phase = "planned"
  /\ admission' = IF ApplyMargin THEN ExpectedAdmission ELSE measured
  /\ evaluated' = TRUE
  /\ LET overBytes == EnforceBytes /\ bytes > Cap
         overExact == evidence = "exact" /\ admission' > Cap
         overEstimate == evidence = "estimate" /\ admission' > Cap
         missing == ~capPresent /\ MissingFirst
         chosen == IF missing THEN "missing"
                   ELSE IF ~marginValid THEN "malformed"
                   ELSE IF overBytes \/ overExact \/ overEstimate THEN "exceeded"
                   ELSE IF ~capPresent THEN "missing"
                   ELSE IF ~HasMeasure \/ (evidence = "bound" /\ admission' > Cap)
                           \/ (evidence = "estimate" /\ ~AllowEstimate) THEN "unavailable"
                   ELSE "none"
     IN /\ refusal' = IF ~DistinguishBound /\ evidence = "bound" /\ chosen = "unavailable"
                      THEN "exceeded" ELSE chosen
        /\ basis' = IF refusal' # "exceeded" THEN "none"
                    ELSE IF overBytes \/ overExact THEN "exact"
                    ELSE IF overEstimate /\ HonestEstimate THEN "estimated"
                    ELSE "exact"
  /\ checked' = (refusal' = "none")
  /\ phase' = IF checked' THEN "ready" ELSE "rejected"
  /\ UNCHANGED <<original, current, evidence, measured, multiplierTwice, reserve,
                  capPresent, marginValid, bytes, anchor, sent, sentAmount, usage, reported>>
MutateCaller == /\ phase \in {"planned", "ready", "anchored"}
                /\ current' \in 1..3
                /\ UNCHANGED <<phase, original, evidence, measured, multiplierTwice, reserve,
                    capPresent, marginValid, bytes, admission, evaluated, checked,
                    anchor, sent, sentAmount, refusal, basis, usage, reported>>
Anchor == /\ WithLog /\ ~anchor /\ ~sent
          /\ phase \in {"planned", "ready"}
          /\ (RequireCheck => checked)
          /\ anchor' = TRUE /\ phase' = "anchored"
          /\ UNCHANGED <<original, current, evidence, measured, multiplierTwice, reserve,
              capPresent, marginValid, bytes, admission, evaluated, checked, sent,
              sentAmount, refusal, basis, usage, reported>>
Send == /\ ~sent /\ phase \in {"planned", "ready", "anchored"}
        /\ (WithLog => anchor) /\ (RequireCheck => checked)
        /\ sent' = TRUE
        /\ sentAmount' = IF PinPlan THEN original ELSE current
        /\ phase' = "sent"
        /\ UNCHANGED <<original, current, evidence, measured, multiplierTwice, reserve,
            capPresent, marginValid, bytes, admission, evaluated, checked, anchor, refusal,
            basis, usage, reported>>
ReceiveUsage ==
  /\ phase = "sent"
  /\ reported' \in {[known |-> FALSE, value |-> 0], [known |-> TRUE, value |-> 1], [known |-> TRUE, value |-> 3]}
  /\ usage' = IF PreserveUsage THEN reported' ELSE [known |-> TRUE, value |-> admission]
  /\ phase' = "done"
  /\ UNCHANGED <<original, current, evidence, measured, multiplierTwice, reserve,
      capPresent, marginValid, bytes, admission, evaluated, checked, anchor, sent,
      sentAmount, refusal, basis>>
Next == Choose \/ Evaluate \/ MutateCaller \/ Anchor \/ Send \/ ReceiveUsage
Spec == Init /\ [][Next]_vars
CheckedBeforeEffects == (anchor \/ sent) => checked
SentFits == sent => (bytes <= Cap /\ (evidence = "estimate" \/ sentAmount <= Cap))
SameFixedPlan == sent => sentAmount = original
UnknownNotExceeded == (evidence = "bound" /\ bytes <= Cap) => refusal # "exceeded"
EstimateCanProceed == (evaluated /\ Eligible /\ evidence = "estimate") => checked
MarginApplied == evaluated => admission = ExpectedAdmission
EstimateNotActual == (basis = "exact" /\ refusal = "exceeded") => ActualOver
MissingPriority == (evaluated /\ ~capPresent) => refusal = "missing"
BytesExact == (evaluated /\ capPresent /\ marginValid /\ bytes > Cap) =>
              (refusal = "exceeded" /\ basis = "exact")
UsageFromUpstream == phase = "done" => usage = reported
=============================================================================
