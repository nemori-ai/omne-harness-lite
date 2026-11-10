------------------------------ MODULE CallLifecycle ------------------------------
(* The lifetime of the durable state of one tool call (W3 slice 11, C15).

   From the caller's side a tool call is stateless. The Tool keeps the call durable so that the
   consumer can still get the result after a restart, and so that the function is not executed
   twice. Both purposes end when the consumer has saved the result and has acknowledged it. After
   that the whole call domain is removed at an instant on the due index.

   One call identity. The identity is a function of the consumer position, so a consumer that has
   not saved the result sends the same identity again after a restart. *)
EXTENDS Naturals

CONSTANTS
  G,        \* grace after the acknowledgement, longer than the late-write window
  D,        \* retention of an offloaded body
  MaxT,     \* bound of the clock
  Fault     \* "none", or the name of one negative control

NoDue == MaxT + 10
Max(a, b) == IF a > b THEN a ELSE b

VARIABLES
  cons,     \* the consumer's durable record: "none", "wanting", "saved"
  dom,      \* the call domain: "absent", "excluded", "admitted", "ran", "settled", "released"
  due,      \* the due index entry of the domain, or NoDue
  body,     \* the instant until which the offloaded body must be readable, or NoDue
  now,
  execs,    \* how many times the function ran (an external effect)
  bytes,    \* whether the body store holds the bytes of the offloaded body
  busy,     \* whether the domain may not be removed yet: a task is pending, or the host still
            \* holds records of the call that another owner refers to
  lost      \* ghost: a domain with a call was removed while the consumer had not saved

vars == <<cons, dom, due, body, now, execs, bytes, busy, lost>>

TypeOK ==
  /\ cons \in {"none", "wanting", "saved"}
  /\ dom \in {"absent", "excluded", "admitted", "ran", "settled", "released"}
  /\ due \in (0..MaxT + G + D) \cup {NoDue}
  /\ body \in (0..MaxT + D) \cup {NoDue}
  /\ now \in 0..MaxT
  /\ execs \in 0..3
  /\ bytes \in BOOLEAN
  /\ busy \in BOOLEAN
  /\ lost \in BOOLEAN

Init ==
  /\ cons = "none" /\ dom = "absent" /\ due = NoDue /\ body = NoDue
  /\ now = 0 /\ execs = 0 /\ bytes = FALSE /\ busy = FALSE /\ lost = FALSE

(* The consumer records that it wants the call. *)
Issue ==
  /\ cons = "none"
  /\ cons' = "wanting"
  /\ UNCHANGED <<dom, due, body, now, execs, bytes, busy, lost>>

(* The consumer sends the call, or sends it again after a restart. A domain that holds the call
   answers with the original admission. A domain without the call admits it. *)
Admit ==
  /\ \/ cons = "wanting"
     \/ Fault = "consumer-resends-after-save" /\ cons = "saved"
  /\ dom \in {"absent", "excluded"}
  /\ dom' = "admitted"
  /\ due' = NoDue
  /\ UNCHANGED <<cons, body, now, execs, bytes, busy, lost>>

Execute ==
  /\ dom = "admitted"
  /\ execs < 3
  /\ dom' = "ran"
  /\ execs' = execs + 1
  /\ UNCHANGED <<cons, due, body, now, bytes, busy, lost>>

(* The result is committed. An offloaded body gets its fixed retention. *)
Settle ==
  /\ dom = "ran"
  /\ dom' = "settled"
  /\ \/ body' = NoDue /\ bytes' = FALSE
     \/ body' = now + D /\ bytes' = TRUE
  /\ busy' \in BOOLEAN
  /\ UNCHANGED <<cons, due, now, execs, lost>>

(* The consumer saves the pushed result in its own durable record. *)
Save ==
  /\ dom = "settled"
  /\ cons = "wanting"
  /\ cons' = "saved"
  /\ UNCHANGED <<dom, due, body, now, execs, bytes, busy, lost>>

(* The acknowledgement of the consumer releases the delivery and schedules the removal. *)
Ack ==
  /\ dom = "settled"
  /\ \/ cons = "saved"
     \/ Fault = "ack-before-save"
  /\ dom' = "released"
  /\ due' = IF Fault = "release-ignores-body" \/ body = NoDue THEN now + G ELSE Max(now + G, body)
  /\ UNCHANGED <<cons, body, now, execs, bytes, busy, lost>>

(* What kept the domain busy ends: the last task settles, the host lets its records go. *)
Quiesce ==
  /\ busy
  /\ dom = "released"
  /\ busy' = FALSE
  /\ UNCHANGED <<cons, dom, due, body, now, execs, bytes, lost>>

(* The sweep finds a due domain that may not be removed yet, and schedules it again. *)
Postpone ==
  /\ dom = "released" /\ due # NoDue /\ now >= due
  /\ busy
  /\ now + G <= MaxT
  /\ due' = now + G
  /\ UNCHANGED <<cons, dom, body, now, execs, bytes, busy, lost>>

(* The sweep deletes the bytes of the body of a due domain before it removes the domain. *)
DeleteBytes ==
  /\ dom = "released" /\ due # NoDue /\ now >= due
  /\ ~busy
  /\ bytes
  /\ bytes' = FALSE
  /\ UNCHANGED <<cons, dom, due, body, now, execs, busy, lost>>

(* The sweep removes a due domain: every record, its due entry and its revision. *)
Sweep ==
  /\ \/ dom \in {"released", "excluded"} /\ due # NoDue
     \/ Fault = "reclaim-before-ack" /\ dom = "settled"
  /\ \/ now >= due
     \/ Fault = "sweep-before-due"
     \/ Fault = "reclaim-before-ack" /\ dom = "settled"
  /\ ~busy \/ Fault = "drop-while-busy"
  /\ ~bytes \/ Fault = "drop-before-body-bytes" \/ Fault = "sweep-before-due"
     \/ Fault = "release-ignores-body" \/ Fault = "reclaim-before-ack"
  /\ lost' = (lost \/ (dom \in {"settled", "released"} /\ cons # "saved"))
  /\ dom' = "absent"
  /\ due' = IF Fault = "delete-without-unschedule" THEN due ELSE NoDue
  /\ UNCHANGED <<cons, body, now, execs, bytes, busy>>

(* A query or a control for an operation the domain does not hold writes an exclusion. In a domain
   without the call the exclusion is the only record, so it gets its own removal instant. *)
LateOperation ==
  /\ dom = "absent"
  /\ now + G <= MaxT
  /\ dom' = "excluded"
  /\ due' = IF Fault = "exclusion-without-due" THEN NoDue ELSE now + G
  /\ UNCHANGED <<cons, body, now, execs, bytes, busy, lost>>

Tick ==
  /\ now < MaxT
  /\ now' = now + 1
  /\ UNCHANGED <<cons, dom, due, body, execs, bytes, busy, lost>>

Next ==
  \/ Issue \/ Admit \/ Execute \/ Settle \/ Save \/ Ack \/ Quiesce \/ Postpone \/ DeleteBytes
  \/ Sweep \/ LateOperation \/ Tick

Spec == Init /\ [][Next]_vars
FairSpec ==
  Spec /\ WF_vars(Admit) /\ WF_vars(Execute) /\ WF_vars(Settle) /\ WF_vars(Save) /\ WF_vars(Ack)
       /\ WF_vars(Sweep) /\ WF_vars(Tick) /\ WF_vars(Quiesce) /\ WF_vars(Postpone)
       /\ WF_vars(DeleteBytes)

(* The function runs at most once for one call identity. *)
AtMostOnce == execs <= 1
(* The call is removed only after the consumer saved the result. *)
RemovedOnlyAfterSaved == ~lost
(* A domain without records has no due entry. *)
NoOrphanDue == dom = "absent" => due = NoDue
(* A domain that nothing will write again has a removal instant. *)
IdleIsScheduled == dom \in {"released", "excluded"} => due # NoDue
(* An offloaded body stays readable for its whole retention. *)
BodyKept == (body # NoDue /\ now < body /\ cons = "saved") => dom \in {"settled", "released"}
(* A removed domain leaves no bytes in the body store. *)
NoOrphanBytes == dom = "absent" => ~bytes
(* A domain is not removed while a task is pending or the host still holds its records. *)
NotRemovedWhileBusy == dom = "absent" => ~busy
(* A due entry is never earlier than the instant it was written for. *)
RemovalNotEarly == (dom = "absent" /\ cons = "saved" /\ body # NoDue) => now >= body

(* A saved result is acknowledged. A scheduled domain does not stay idle past its instant: it is
   removed, or an exclusion-only domain admits the call. *)
EventuallyAcked == (cons = "saved" /\ dom = "settled") ~> (dom # "settled")
EventuallyRemoved ==
  /\ (dom = "released" /\ due <= MaxT) ~> (dom = "absent")
  /\ (dom = "excluded" /\ due <= MaxT) ~> (dom \in {"absent", "admitted"})
==================================================================================
