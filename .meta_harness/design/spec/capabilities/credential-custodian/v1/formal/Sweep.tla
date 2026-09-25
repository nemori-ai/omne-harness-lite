------------------------------- MODULE Sweep -------------------------------
(***************************************************************************)
(* capability.credential-custodian v1 -- OAuth entries: the custodian's    *)
(* sweep interleaved with the bridge's completion on the same binding.     *)
(*                                                                         *)
(* One holding, a few bindings (successive OAuth flows on that holding),   *)
(* a few references the custodian may issue.  Each action is atomic on     *)
(* the binding it touches: that atomicity stands for "ordered on the       *)
(* binding" (contract S-18 item 2, S-19 row 2).  `now` is the one time     *)
(* source, never going back.                                               *)
(*                                                                         *)
(* Three toggles each turn one protection off; the positive configuration  *)
(* keeps all of them TRUE, each negative configuration flips exactly one   *)
(* and is expected to produce a counterexample.                            *)
(*   SweepOnlyThree    -- S-18 item 1: discard only the three kinds        *)
(*   CompleteFreshTime -- S-18 item 2: the bridge judges expiry with the   *)
(*                        time read after it is ordered on the binding     *)
(*                        (premise on the bridge side, bridge node C-3)    *)
(*   SweepEnabled      -- S-18 item 4: the sweep runs at all               *)
(***************************************************************************)
EXTENDS Naturals

CONSTANTS
    Bindings,          \* binding ids on the one holding
    Refs,              \* references the custodian may issue
    NoRef, NoBinding,  \* model values meaning "none"
    TTL,               \* oauthPendingTtl, in clock ticks
    MaxTime,           \* bound on the clock (finite check)
    SweepOnlyThree,
    CompleteFreshTime,
    SweepEnabled

ASSUME TTL \in Nat /\ MaxTime \in Nat
ASSUME SweepOnlyThree \in BOOLEAN /\ CompleteFreshTime \in BOOLEAN /\ SweepEnabled \in BOOLEAN
ASSUME NoRef \notin Refs /\ NoBinding \notin Bindings

VARIABLES
    now,       \* reading of the time source
    bstate,    \* binding state: none / pending / granted / revoked
    since,     \* time the binding entered its current state
    bref,      \* reference recorded when the binding went to granted
    estate,    \* entry: free (not issued) / held / discarded
    ebind,     \* binding the entry points at
    inflight,  \* deposited entries whose completion is not yet ordered
    xtime      \* time of the bridge's earlier read (used when CompleteFreshTime = FALSE)

vars == <<now, bstate, since, bref, estate, ebind, inflight, xtime>>

BStates == {"none", "pending", "granted", "revoked"}
EStates == {"free", "held", "discarded"}
Time == 0..MaxTime

TypeOK ==
    /\ now \in Time
    /\ bstate \in [Bindings -> BStates]
    /\ since \in [Bindings -> Time]
    /\ bref \in [Bindings -> Refs \cup {NoRef}]
    /\ estate \in [Refs -> EStates]
    /\ ebind \in [Refs -> Bindings \cup {NoBinding}]
    /\ inflight \subseteq Refs
    /\ xtime \in [Refs -> Time]

Init ==
    /\ now = 0
    /\ bstate = [b \in Bindings |-> "none"]
    /\ since = [b \in Bindings |-> 0]
    /\ bref = [b \in Bindings |-> NoRef]
    /\ estate = [r \in Refs |-> "free"]
    /\ ebind = [r \in Refs |-> NoBinding]
    /\ inflight = {}
    /\ xtime = [r \in Refs |-> 0]

Expired(b, t) == t > since[b] + TTL

\* The time source advances.
Tick ==
    /\ now < MaxTime
    /\ now' = now + 1
    /\ UNCHANGED <<bstate, since, bref, estate, ebind, inflight, xtime>>

\* mcp-bridge S-22: a new flow on the holding; an older pending one is revoked
\* in the same step.
Begin(b) ==
    /\ bstate[b] = "none"
    /\ bstate' = [c \in Bindings |->
                    IF c = b THEN "pending"
                    ELSE IF bstate[c] = "pending" THEN "revoked"
                    ELSE bstate[c]]
    /\ since' = [c \in Bindings |->
                    IF c = b \/ bstate[c] = "pending" THEN now ELSE since[c]]
    /\ UNCHANGED <<now, bref, estate, ebind, inflight, xtime>>

\* Contract S-16 depositOAuth: the entry is held and points at an existing
\* binding; the binding's state is not looked at.
Deposit(b, r) ==
    /\ bstate[b] # "none"
    /\ estate[r] = "free"
    /\ estate' = [estate EXCEPT ![r] = "held"]
    /\ ebind' = [ebind EXCEPT ![r] = b]
    /\ inflight' = inflight \cup {r}
    /\ xtime' = [xtime EXCEPT ![r] = now]
    /\ UNCHANGED <<now, bstate, since, bref>>

\* mcp-bridge S-23: ordered on the binding; still pending and not expired
\* => granted, recording this reference.  Otherwise nothing changes.
Complete(r) ==
    /\ r \in inflight
    /\ LET b == ebind[r]
           t == IF CompleteFreshTime THEN now ELSE xtime[r]
       IN  IF bstate[b] = "pending" /\ ~Expired(b, t)
           THEN /\ bstate' = [bstate EXCEPT ![b] = "granted"]
                /\ since' = [since EXCEPT ![b] = now]
                /\ bref' = [bref EXCEPT ![b] = r]
           ELSE UNCHANGED <<bstate, since, bref>>
    /\ inflight' = inflight \ {r}
    /\ UNCHANGED <<now, estate, ebind, xtime>>

\* mcp-bridge S-8: denied, expiry written down, renewal refused, reference
\* no longer configured on the holding.
Revoke(b) ==
    /\ bstate[b] \in {"pending", "granted"}
    /\ bstate' = [bstate EXCEPT ![b] = "revoked"]
    /\ since' = [since EXCEPT ![b] = now]
    /\ UNCHANGED <<now, bref, estate, ebind, inflight, xtime>>

\* Contract S-18: the three kinds of discardable entries (expiry judged with
\* the time read after being ordered on the binding, i.e. `now`).
ThreeKinds(r) ==
    LET b == ebind[r] IN
        \/ bstate[b] = "revoked"
        \/ (bstate[b] = "pending" /\ Expired(b, now))
        \/ (bstate[b] = "granted" /\ bref[b] # r)

Discardable(r) ==
    IF SweepOnlyThree
    THEN ThreeKinds(r)
    ELSE ~(bstate[ebind[r]] = "granted" /\ bref[ebind[r]] = r)

\* Contract S-18: the custodian's sweep, one entry at a time.
Sweep(r) ==
    /\ SweepEnabled
    /\ estate[r] = "held"
    /\ Discardable(r)
    /\ estate' = [estate EXCEPT ![r] = "discarded"]
    /\ UNCHANGED <<now, bstate, since, bref, ebind, inflight, xtime>>

Next ==
    \/ Tick
    \/ \E b \in Bindings : Begin(b) \/ Revoke(b)
    \/ \E b \in Bindings, r \in Refs : Deposit(b, r)
    \/ \E r \in Refs : Complete(r) \/ Sweep(r)

\* Weak fairness on each entry's sweep is the premise of the progress
\* property (contract S-18 item 4: bounded by sweepInterval).
Spec == Init /\ [][Next]_vars /\ \A r \in Refs : WF_vars(Sweep(r))

-----------------------------------------------------------------------------
(* Properties *)

\* Contract section 7, invariant 3: a granted binding's recorded entry is
\* still held and points back at it -- resolve would hand it out (S-17).
GrantedResolvable ==
    \A b \in Bindings :
        bstate[b] = "granted" =>
            /\ bref[b] \in Refs
            /\ estate[bref[b]] = "held"
            /\ ebind[bref[b]] = b

\* Contract section 7, progress 1: a held entry of one of the three kinds is
\* eventually discarded.
OrphanEventuallySwept ==
    \A r \in Refs :
        (estate[r] = "held" /\ ThreeKinds(r)) ~> (estate[r] = "discarded")

\* Reachability probes: each is expected to be violated (the violation is the
\* witness that the path exists).  Not evidence on their own.
NoGrantedEver == \A b \in Bindings : bstate[b] # "granted"
NoDiscardEver == \A r \in Refs : estate[r] # "discarded"

=============================================================================
