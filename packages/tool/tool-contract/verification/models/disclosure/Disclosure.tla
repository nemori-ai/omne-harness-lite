----------------------------- MODULE Disclosure -----------------------------
(***************************************************************************)
(* Bounded disclosure (I-1): the first screen a model receives for one tool *)
(* result is bounded by the effective threshold L, whatever the body size.  *)
(*                                                                         *)
(* A declaration carries the author's threshold T, the author's preview cap *)
(* Tp and the header bound headerMax. The system carries its threshold S,  *)
(* its preview cap Sp and the divisor K. Acceptance of the declaration      *)
(* fixes L = min(T, S) and P = min(Tp, Sp, L div K) and refuses unless      *)
(* headerMax + P <= L. A result whose body is at most L is given inline;   *)
(* a larger body is offloaded and the first screen is a header (metadata,  *)
(* 1..headerMax, outside the budget) plus a preview of at most P. The body *)
(* itself is never rewritten. A restart may tighten S or Sp; the           *)
(* declaration is then accepted again under the new values.                *)
(*                                                                         *)
(* Bug = "none" is the contract. Each other value removes one rule.        *)
(***************************************************************************)
EXTENDS Integers, FiniteSets

CONSTANTS
  K,    \* preview divisor
  Bug

Min(a, b) == IF a <= b THEN a ELSE b
Max(a, b) == IF a >= b THEN a ELSE b

Stages == {"declared", "accepted", "rejected", "sent", "refused"}
Declarations == [T : {2, 4}, Tp : {1, 2}, headerMax : {1, 2}]
InitialSystem == [S |-> 4, Sp |-> 2]
TightenedSystems == {[S |-> 4, Sp |-> 1], [S |-> 2, Sp |-> 1]}
NoPolicy == [L |-> 0, P |-> 0, header |-> 0]
BodySizes == 1..5
AuthorSizes == 0..3

VARIABLES
  epoch,     \* 0 before the restart, 1 after it
  sys,       \* system values [S, Sp]
  decl,      \* the declaration [T, Tp, headerMax], chosen at Init
  policy,    \* the accepted policy [L, P, header], or NoPolicy
  stage,
  body,      \* stored size of the latest result body, 0 = none
  original,  \* ghost: the size the latest result body had when produced
  sent       \* ghost: first screens given to the model

vars == <<epoch, sys, decl, policy, stage, body, original, sent>>

Init ==
  /\ epoch = 0
  /\ sys = InitialSystem
  /\ decl \in Declarations
  /\ policy = NoPolicy
  /\ stage = "declared"
  /\ body = 0
  /\ original = 0
  /\ sent = {}

Threshold(d, s) == Min(d.T, s.S)

(* P = min(Tp, Sp, floor(L / K)); the bug takes the maximum instead. *)
Budget(d, s) ==
  LET L == Threshold(d, s) IN
  IF Bug = "max-not-min" THEN Max(Max(d.Tp, s.Sp), L \div K)
                         ELSE Min(Min(d.Tp, s.Sp), L \div K)

(* acceptance: fix L and P, refuse unless header and preview fit in L. The
   mismatch bug counts the header inside the budget at acceptance while the
   first screen puts it outside. *)
Accept ==
  /\ stage = "declared"
  /\ LET L == Threshold(decl, sys)
         P == Budget(decl, sys)
         fits == IF Bug = "header-in-budget-mismatch" THEN P <= L
                                                        ELSE decl.headerMax + P <= L IN
     IF fits THEN /\ policy' = [L |-> L, P |-> P, header |-> decl.headerMax]
                  /\ stage' = "accepted"
             ELSE /\ policy' = NoPolicy
                  /\ stage' = "rejected"
  /\ UNCHANGED <<epoch, sys, decl, body, original, sent>>

(* restart with tightened system values: the accepted policy is dropped and the
   declaration goes through acceptance again. The stale bug keeps the old policy. *)
Restart ==
  /\ epoch = 0
  /\ epoch' = 1
  /\ sys' \in TightenedSystems
  /\ IF Bug = "stale" THEN UNCHANGED <<policy, stage>>
                      ELSE policy' = NoPolicy /\ stage' = "declared"
  /\ UNCHANGED <<decl, body, original, sent>>

(* a first screen: what the model got, with the produced body size and the
   system values of that moment. *)
Screen(b, inline, h, p) ==
  [body |-> b, inline |-> inline, header |-> h, preview |-> p, total |-> h + p,
   S |-> sys.S, Sp |-> sys.Sp]

(* a result of size b arrives under the accepted policy. *)
Commit(b) ==
  /\ stage = "accepted"
  /\ original' = b
  /\ IF b <= policy.L \/ Bug = "bypass"
       THEN \* inline: the model gets the whole body
            /\ body' = b
            /\ sent' = sent \cup {Screen(b, TRUE, 0, b)}
            /\ stage' = "sent"
       ELSE IF Bug = "rewrite"
       THEN \* silent truncation of the body to L instead of offloading
            /\ body' = policy.L
            /\ sent' = sent \cup {Screen(b, TRUE, 0, policy.L)}
            /\ stage' = "sent"
       ELSE \* offloaded: header plus a mechanical or author preview
            /\ body' = b
            /\ \E h \in 1..policy.header :
                 \/ \E p \in 0..policy.P :
                      /\ sent' = sent \cup {Screen(b, FALSE, h, p)}
                      /\ stage' = "sent"
                 \/ \E a \in AuthorSizes :
                      IF a <= policy.P
                        THEN /\ sent' = sent \cup {Screen(b, FALSE, h, a)}
                             /\ stage' = "sent"
                        ELSE \* author-preview-too-large: refused, not truncated
                             /\ sent' = sent
                             /\ stage' = "refused"
  /\ UNCHANGED <<epoch, sys, decl, policy>>

Next ==
  \/ Accept
  \/ Restart
  \/ \E b \in BodySizes : Commit(b)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Properties. The bounds are recomputed from the declaration and the system
   values recorded at the time of the first screen, not from the policy. *)

TypeOK ==
  /\ epoch \in {0, 1}
  /\ sys \in {InitialSystem} \cup TightenedSystems
  /\ decl \in Declarations
  /\ stage \in Stages
  /\ body \in {0} \cup BodySizes
  /\ original \in {0} \cup BodySizes
  /\ Cardinality(sent) <= 2

EffectiveL(s) == Min(decl.T, s.S)
EffectiveP(s) == Min(Min(decl.Tp, s.Sp), EffectiveL(s) \div K)

(* I-1. Every first screen is at most L. *)
FirstScreenWithinL == \A s \in sent : s.total <= EffectiveL(s)

(* I-1. An offloaded first screen has a header within headerMax and a preview
   within P = min(Tp, Sp, floor(L / K)) under the system values of that moment. *)
PreviewWithinBudget ==
  \A s \in sent : ~s.inline =>
    /\ s.header \in 1..decl.headerMax
    /\ s.preview <= EffectiveP(s)

(* Inline only when the produced body fits in L. *)
InlineOnlyWithinL == \A s \in sent : s.inline => s.body <= EffectiveL(s)

(* The body is never rewritten to make it fit. *)
BodyPreserved == body = original

(* An accepted declaration leaves room for header and preview. *)
AcceptedDeclarationFits ==
  stage = "accepted" => policy.header + policy.P <= policy.L

=============================================================================
