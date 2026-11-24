---------------------------- MODULE ScreenChoice ----------------------------
(* One screenshot at a time: the main process freezes every screen, opens an overlay on each, and takes one answer.
   Each overlay page is the environment: it can be pressed, hand in a picture or a cancel, or go away, and its
   requests reach the main process in any order and possibly late. The main process handles one request at a time. *)
EXTENDS Naturals, Sequences

CONSTANTS Screens, MaxCaptures,
          IgnoreCapture,  \* control: requests are not matched to the capture that opened their overlay
          NoLock,         \* control: a press on one overlay does not shut the others out
          AnswerWhenIdle  \* control: an answer is taken even when no capture is waiting for one

None == "none"
Kinds == {"picture", "cancel"}

VARIABLES phase, capture, active, page, inflight, answers
vars == <<phase, capture, active, page, inflight, answers>>

Message == [kind : {"active", "gone"} \cup Kinds, screen : Screens, capture : 1..MaxCaptures]

TypeOK ==
  /\ phase \in {"idle", "choosing"}
  /\ capture \in 0..MaxCaptures
  /\ active \in Screens \cup {None}
  /\ page \in [Screens -> {"closed", "open", "pressed", "sent"}]
  /\ inflight \subseteq Message

Init ==
  /\ phase = "idle"
  /\ capture = 0
  /\ active = None
  /\ page = [s \in Screens |-> "closed"]
  /\ inflight = {}
  /\ answers = <<>>

(* POST /device/screen: freeze every screen, open an overlay on each with this capture's number. *)
Capture ==
  /\ phase = "idle"
  /\ capture < MaxCaptures
  /\ phase' = "choosing"
  /\ capture' = capture + 1
  /\ active' = None
  /\ page' = [s \in Screens |-> "open"]
  /\ UNCHANGED <<inflight, answers>>

(* An overlay takes the pointer while no other overlay is the active one. *)
Takes(s) == phase = "choosing" /\ page[s] = "open" /\ (NoLock \/ active \in {None, s})

(* The person presses on an overlay; its page reports that it is the active one. *)
Press(s) ==
  /\ Takes(s)
  /\ page' = [page EXCEPT ![s] = "pressed"]
  /\ inflight' = inflight \cup {[kind |-> "active", screen |-> s, capture |-> capture]}
  /\ UNCHANGED <<phase, capture, active, answers>>

(* The page hands in a picture (OK, double-click) or a cancel (right-click, the cancel button). *)
Finish(s, k) ==
  /\ page[s] = "pressed"
  /\ page' = [page EXCEPT ![s] = "sent"]
  /\ inflight' = inflight \cup {[kind |-> k, screen |-> s, capture |-> capture]}
  /\ UNCHANGED <<phase, capture, active, answers>>

(* An overlay goes away from outside: closed, its page did not load, its renderer died. *)
Gone(s) ==
  /\ phase = "choosing"
  /\ page[s] \in {"open", "pressed"}
  /\ page' = [page EXCEPT ![s] = "closed"]
  /\ inflight' = inflight \cup {[kind |-> "gone", screen |-> s, capture |-> capture]}
  /\ UNCHANGED <<phase, capture, active, answers>>

Current(m) == IgnoreCapture \/ m.capture = capture
Allowed(m) == NoLock \/ active \in {None, m.screen}
Waiting == AnswerWhenIdle \/ phase = "choosing"

(* The capture settles: one answer, every overlay closed, back to idle. *)
Settle(m, k) ==
  /\ answers' = Append(answers, [kind |-> k, screen |-> m.screen, from |-> m.capture, of |-> capture, locked |-> active])
  /\ phase' = "idle"
  /\ active' = None
  /\ page' = [s \in Screens |-> "closed"]

Ignore == UNCHANGED <<phase, active, page, answers>>

(* The main process handles one request: it has read the request whole, then checks and settles in one step. *)
Deliver(m) ==
  /\ inflight' = inflight \ {m}
  /\ UNCHANGED capture
  /\ CASE m.kind = "active" ->
            IF phase = "choosing" /\ Current(m) /\ active = None
            THEN active' = m.screen /\ UNCHANGED <<phase, page, answers>>
            ELSE Ignore
       [] m.kind \in Kinds ->
            IF Waiting /\ Current(m) /\ Allowed(m) THEN Settle(m, m.kind) ELSE Ignore
       [] m.kind = "gone" ->
            IF phase = "choosing" /\ Current(m) /\ active \in {None, m.screen}
            THEN Settle(m, "cancel")
            ELSE Ignore

Next ==
  \/ Capture
  \/ \E s \in Screens : Press(s) \/ Gone(s) \/ \E k \in Kinds : Finish(s, k)
  \/ \E m \in inflight : Deliver(m)

Spec == Init /\ [][Next]_vars

(* At most one answer per capture. *)
OneAnswerPerCapture ==
  \A i, j \in 1..Len(answers) : i # j => answers[i].of # answers[j].of

(* An answer comes from an overlay that this capture opened, never from an earlier one. *)
AnswerFromItsCapture ==
  \A i \in 1..Len(answers) : answers[i].from = answers[i].of

(* Once a press made one overlay the active one, no other overlay's answer is taken. *)
AnswerFromActive ==
  \A i \in 1..Len(answers) : answers[i].locked \in {None, answers[i].screen}

(* Witness: a picture can be handed in. Violated on purpose by the reachability configuration. *)
NeverPicture ==
  \A i \in 1..Len(answers) : answers[i].kind # "picture"
=============================================================================
