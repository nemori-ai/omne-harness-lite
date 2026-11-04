------------------------------ MODULE ReadGate ------------------------------
(***************************************************************************)
(* The read gate of @omne-harness/skill: the four SkillAccess operations  *)
(* (steps 1-11 of the group page "读取") and the SkillCatalog listing, as *)
(* runs against three ports. Two runs `1` and `2` share one request and   *)
(* one schedule of port faults, aborts and source changes. That is the    *)
(* self-composition: in Mode "twin" the two runs see two worlds that      *)
(* differ only in how the identity `Hidden` is unavailable to the         *)
(* observer (variants "refused-hides", "refused-shows", "checked-only",   *)
(* "deleted"); in Mode "same" they see one world and differ only in the   *)
(* completion order of the catalog read checks; in Mode "single" only run *)
(* 1 runs. Outside "twin", `Hidden` is "refused-shows" or "granted".      *)
(*                                                                         *)
(* The observer is one principal. Skill keeps no state between calls, so  *)
(* one operation per run is the whole behaviour. Port answers are         *)
(* abstract: "undecided" stands for the answer `unknown`, a malformed     *)
(* answer, a rejection and a synchronous throw, which the implementation  *)
(* parses into one case (contract SPEC "端口答复的统一处置").            *)
(*                                                                         *)
(* The resolution may answer with a reference to other material than the *)
(* request (action ResolveMisdirected): the reference of the other        *)
(* identity, or, with a basis, another material of the requested one.     *)
(* Skill takes such an answer for no answer (S7).                          *)
(*                                                                         *)
(* Flaw selects a deliberate defect so that each property has a negative  *)
(* configuration that must report a counterexample.                       *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    Mode,         \* "single" | "twin" | "same"
    Flaw,         \* "none" | "refusedAsBasis" | "unknownAsEmpty" | "noEntryDigest"
                  \*   | "noCheckAfterSnapshot" | "completionOrder" | "noRefCheck"
    FaultNames,   \* the port faults of the schedule, see FaultOf
    AbortPoints,  \* abort after this many port answers; Never: no abort
    ChangePoints, \* the source holds `later` from this many port answers on
    SourceModes   \* "digest": open keys bytes by snapshot digest; "locator": it does not

Never == 99
Gone == 9                             \* the source holds no package at the locator
Hidden == "h"
Other == "x"
IdSeq == <<"h", "x">>                 \* the canonical (category, name) order
Ids == {Hidden, Other}
Mats == {0, 1}
Runs == {1, 2}
How == {"refused-hides", "refused-shows", "deleted", "checked-only", "granted"}

(* Two materials of one identity. Material 1 adds the entry "new"; "res" and
   "new" have the same bytes in every material of every identity, "SKILL"
   differs between materials and between identities. So the snapshot digest
   of a material names its identity too. *)
EntrySeq(m) == IF m = 0 THEN <<"SKILL", "res">> ELSE <<"SKILL", "new", "res">>
Entries(m) == {EntrySeq(m)[i] : i \in 1..Len(EntrySeq(m))}
EntryDigest(i, m, p) == IF p = "SKILL" THEN <<i, m>> ELSE <<"-", 0>>

NoBasis == [id |-> "none", mat |-> 0]
NoPin == [id |-> "-", mat |-> -1]
(* `id` is the identity that a success names; content items are <<identity, material, entry>>. *)
NoOut == [kind |-> "-", id |-> "-", mat |-> -1, content |-> {}, entries |-> <<>>]
Out(k) == [NoOut EXCEPT !.kind = k]

(***************************************************************************)
(* Scope by mode.                                                         *)
(***************************************************************************)
Targets == IF Mode = "twin" THEN {Hidden} ELSE {Other}
Bases == IF Mode = "twin"
            THEN {NoBasis} \cup [id : Ids, mat : Mats]
            ELSE {NoBasis, [id |-> Other, mat |-> 0], [id |-> Other, mat |-> 1],
                  [id |-> Hidden, mat |-> 0]}
Parts == {"body", "res", "new", "bad"}
AccessOps == {"describe", "read", "list", "export"}
Ops == IF Mode = "same" THEN {"catalog"} ELSE AccessOps \cup {"catalog"}

AccessRequests ==
    {[op |-> o, target |-> t, basis |-> b, part |-> p, all |-> FALSE, keep |-> {}] :
        o \in AccessOps \cap Ops, t \in Targets, b \in Bases, p \in Parts}
CatalogRequests ==
    {[op |-> "catalog", target |-> Other, basis |-> NoBasis, part |-> "body", all |-> a, keep |-> k] :
        a \in BOOLEAN, k \in SUBSET Ids}
Valid(r) ==
    /\ r.op = "read" \/ r.part = "body"          \* only read has a part
    /\ r.op = "export" => r.basis # NoBasis      \* export takes a basis
    /\ r.all => r.keep = {}                      \* all: no capabilities given
Requests == {r \in AccessRequests \cup CatalogRequests : Valid(r)}

States == {"adopted", "nodigest", "standin"}
Content == Mats \cup {Gone}
Worlds ==
    {w \in [st : [Ids -> States], cur : [Ids -> Mats], src : [Ids -> Content],
            later : [Ids -> Content], grant : BOOLEAN] :
        \* In "twin" no source changes; in every mode only Other is read, so
        \* the material of Hidden is fixed.
        /\ Mode = "twin" => w.later = w.src
        /\ Mode # "twin" => (w.cur[Hidden] = 0 /\ w.src[Hidden] = 0 /\ w.later[Hidden] = 0)
        /\ Mode = "same" => (w.cur[Other] = 0 /\ w.src = w.later)}

VariantPairs ==
    IF Mode = "twin"
        THEN {<<"refused-hides", "deleted">>, <<"refused-shows", "deleted">>,
              <<"checked-only", "deleted">>, <<"refused-hides", "refused-shows">>,
              <<"refused-hides", "checked-only">>, <<"refused-shows", "checked-only">>}
        ELSE {<<"refused-shows", "refused-shows">>, <<"granted", "granted">>}

FaultOf(n) ==
    CASE n = "none" -> [call |-> "none", arg |-> ""]
      [] n = "check-x" -> [call |-> "check", arg |-> Other]
      [] n = "check-h" -> [call |-> "check", arg |-> Hidden]
      [] n = "resolve" -> [call |-> "resolve", arg |-> ""]
      [] n = "lawful" -> [call |-> "lawful", arg |-> ""]
      [] n = "snapshot-undecided" -> [call |-> "snapshot", arg |-> "undecided"]
      [] n = "snapshot-notFound" -> [call |-> "snapshot", arg |-> "notFound"]
      [] n = "snapshot-entryNotFound" -> [call |-> "snapshot", arg |-> "entryNotFound"]
      [] n = "open-undecided" -> [call |-> "open", arg |-> "undecided"]
      [] n = "open-notFound" -> [call |-> "open", arg |-> "notFound"]
      [] n = "open-entryNotFound" -> [call |-> "open", arg |-> "entryNotFound"]
      [] n = "misdirect-identity" -> [call |-> "misdirect", arg |-> "identity"]
      [] n = "misdirect-material" -> [call |-> "misdirect", arg |-> "material"]

VARIABLES
    req, w, variant, fault, smode, abortAt, changeAt,     \* the shared schedule
    pc, out, calls, afterAbort, undecided,                \* per run
    pinned, byBasis, todo, content, at,                   \* per run, access
    pending, checked, verdict, order                      \* per run, catalog

shared == <<req, w, variant, fault, smode, abortAt, changeAt>>
local == <<pc, out, calls, afterAbort, undecided, pinned, byBasis, todo, content, at,
           pending, checked, verdict, order>>
vars == <<shared, local>>

(***************************************************************************)
(* The ports, as seen by run r.                                            *)
(***************************************************************************)
V(r) == variant[r]
Known(r, t) == t # Hidden \/ V(r) \in {"refused-shows", "granted"}
Lawful(t) == {0, w.cur[t]}

CheckAnswer(r, t) ==
    IF fault = [call |-> "check", arg |-> t] THEN "undecided"
    ELSE IF t = Hidden THEN (IF V(r) \in {"checked-only", "granted"} THEN "granted" ELSE "refused")
    ELSE IF w.grant THEN "granted" ELSE "refused"

(* `id` and `mat` of an adopted answer are the identity and material that its
   reference names. *)
ResolveAnswer(r, t, b) ==
    IF fault.call = "resolve" THEN [kind |-> "undecided", id |-> t, mat |-> 0, dig |-> FALSE]
    ELSE IF ~Known(r, t) THEN [kind |-> "none", id |-> t, mat |-> 0, dig |-> FALSE]
    ELSE IF w.st[t] = "standin" THEN [kind |-> "standin", id |-> t, mat |-> 0, dig |-> FALSE]
    ELSE IF b # NoBasis /\ b.mat \notin Lawful(t)
        THEN [kind |-> "basisNotLawful", id |-> t, mat |-> 0, dig |-> FALSE]
    ELSE [kind |-> "adopted", id |-> t, mat |-> IF b = NoBasis THEN w.cur[t] ELSE b.mat,
          dig |-> w.st[t] = "adopted"]

OtherId(t) == IF t = Hidden THEN Other ELSE Hidden

(* A reference to other material than the request, without PR1 and PR3:
   "identity" names the current material of the other identity; "material",
   with a basis, names the other material of the requested identity. Without
   a basis "material" is the honest answer: the adopted material is the
   resolution's own word. *)
MisdirectedAnswer(r, t, b) ==
    IF fault.arg = "identity"
        THEN [kind |-> "adopted", id |-> OtherId(t), mat |-> w.cur[OtherId(t)], dig |-> TRUE]
    ELSE LET honest == ResolveAnswer(r, t, b) IN
        IF honest.kind = "adopted" /\ b # NoBasis THEN [honest EXCEPT !.mat = 1 - b.mat]
        ELSE honest

(* S7 at the boundary: an adopted answer about another identity, or with a
   basis about another material, is no answer. *)
Misnames(a, t, b) == a.kind = "adopted" /\ (a.id # t \/ (b # NoBasis /\ a.mat # b.mat))
Parsed(a, t, b) ==
    IF Flaw # "noRefCheck" /\ Misnames(a, t, b)
        THEN [kind |-> "undecided", id |-> t, mat |-> 0, dig |-> FALSE]
        ELSE a

SrcNow(r, t) ==
    IF t = Hidden /\ V(r) = "deleted" THEN Gone
    ELSE IF calls[r] >= changeAt THEN w.later[t] ELSE w.src[t]

SnapAnswer(r, t) ==
    IF fault.call = "snapshot" THEN [kind |-> fault.arg, mat |-> 0]
    ELSE IF SrcNow(r, t) = Gone THEN [kind |-> "notFound", mat |-> 0]
    ELSE [kind |-> "ok", mat |-> SrcNow(r, t)]

OpenAnswer(r, t, p) ==
    IF fault.call = "open" THEN [kind |-> fault.arg, mat |-> 0]
    ELSE LET now == SrcNow(r, t) IN
        IF now = Gone THEN [kind |-> "notFound", mat |-> 0]
        ELSE IF smode = "digest" /\ (now # pinned[r].mat \/ t # pinned[r].id)
            THEN [kind |-> "notFound", mat |-> 0]
        ELSE IF p \notin Entries(now) THEN [kind |-> "entryNotFound", mat |-> 0]
        ELSE [kind |-> "ok", mat |-> now]

(* The mapping table of the group page "端口", columns snapshot and open. *)
SnapFailure(r, k) ==
    CASE k = "notFound" -> IF byBasis[r] THEN "basis-unavailable" ELSE "source-unavailable"
      [] OTHER -> "source-unavailable"
OpenFailure(r, k) ==
    CASE k = "notFound" -> IF byBasis[r] THEN "basis-unavailable" ELSE "source-unavailable"
      [] k = "entryNotFound" -> "resource-missing"
      [] OTHER -> "source-unavailable"

(***************************************************************************)
(* One run.                                                                *)
(***************************************************************************)
Abortable == req.op \in {"read", "list", "export"}
AbortedAt(n) == Abortable /\ n >= abortAt         \* the signal after n port answers

Finish(r, o) == /\ pc' = [pc EXCEPT ![r] = "done"]
                /\ out' = [out EXCEPT ![r] = o]

(* One port call of run r: the count, and whether the signal was already aborted. *)
Called(r) == /\ calls' = [calls EXCEPT ![r] = @ + 1]
             /\ afterAbort' = [afterAbort EXCEPT ![r] = @ + IF AbortedAt(calls[r]) THEN 1 ELSE 0]
Undecided(r, kind, answer) ==
    undecided' = [undecided EXCEPT ![r] = IF @ = "" /\ answer = "undecided" THEN kind ELSE @]

Start(r) ==
    /\ pc[r] = "start"
    /\ IF req.op = "catalog"
        THEN IF ~req.all /\ req.keep = {}
                THEN Finish(r, Out("ok"))                       \* empty request: no port
                ELSE pc' = [pc EXCEPT ![r] = "lawful"] /\ UNCHANGED out
        ELSE IF req.basis # NoBasis /\ req.basis.id # req.target
                THEN Finish(r, Out("not-available-to-you"))     \* step 1, no port
             ELSE IF AbortedAt(calls[r])
                THEN Finish(r, Out("aborted"))
             ELSE pc' = [pc EXCEPT ![r] = "check"] /\ UNCHANGED out
    /\ UNCHANGED <<shared, calls, afterAbort, undecided, pinned, byBasis, todo, content, at,
                   pending, checked, verdict, order>>

Check(r) ==
    LET v == CheckAnswer(r, req.target) IN
    /\ pc[r] = "check"
    /\ Called(r)
    /\ Undecided(r, "check", v)
    /\ IF AbortedAt(calls[r] + 1) THEN Finish(r, Out("aborted"))
       ELSE IF v = "refused"
            THEN Finish(r, Out(IF Flaw = "refusedAsBasis" /\ req.basis # NoBasis
                               THEN "basis-unavailable" ELSE "not-available-to-you"))
       ELSE IF v = "undecided" THEN Finish(r, Out("unknown"))
       ELSE pc' = [pc EXCEPT ![r] = "resolve"] /\ UNCHANGED out
    /\ UNCHANGED <<shared, pinned, byBasis, todo, content, at, pending, checked, verdict, order>>

(* Step 3 after the answer `given` of the resolution, parsed at the boundary.
   The locator is the one of the identity that the reference names. *)
Resolved(r, given) ==
    LET a == Parsed(given, req.target, req.basis)
        mat == IF req.basis = NoBasis THEN a.mat ELSE req.basis.mat
        pin == [id |-> IF req.basis = NoBasis THEN a.id ELSE req.target, mat |-> mat]
        keep == UNCHANGED <<pinned, byBasis, at>>
    IN
    /\ pc[r] = "resolve"
    /\ Called(r)
    /\ Undecided(r, "resolve", a.kind)
    /\ IF AbortedAt(calls[r] + 1) THEN Finish(r, Out("aborted")) /\ keep
       ELSE CASE a.kind = "undecided" -> Finish(r, Out("unknown")) /\ keep
              [] a.kind = "none" -> Finish(r, Out("not-available-to-you")) /\ keep
              [] a.kind = "standin" -> Finish(r, Out("unavailable-stand-in")) /\ keep
              [] a.kind = "basisNotLawful" -> Finish(r, Out("basis-unavailable")) /\ keep
              [] req.op = "describe" ->
                    Finish(r, [Out("ok") EXCEPT !.id = a.id, !.mat = IF a.dig THEN mat ELSE -1])
                    /\ keep
              [] ~a.dig -> Finish(r, Out("unsupported")) /\ keep
              [] req.op = "read" /\ req.part = "bad" -> Finish(r, Out("bad-path")) /\ keep
              [] OTHER -> /\ pc' = [pc EXCEPT ![r] = "snapshot"]
                          /\ pinned' = [pinned EXCEPT ![r] = pin]
                          /\ byBasis' = [byBasis EXCEPT ![r] = req.basis # NoBasis]
                          /\ at' = [at EXCEPT ![r] = a.id]
                          /\ UNCHANGED out
    /\ UNCHANGED <<shared, todo, content, pending, checked, verdict, order>>

Resolve(r) ==
    /\ fault.call # "misdirect"
    /\ Resolved(r, ResolveAnswer(r, req.target, req.basis))

(* The resolution answers with a reference to other material than the request. *)
ResolveMisdirected(r) ==
    /\ fault.call = "misdirect"
    /\ Resolved(r, MisdirectedAnswer(r, req.target, req.basis))

PathOf(p) == IF p = "body" THEN "SKILL" ELSE p

Snapshot(r) ==
    LET s == SnapAnswer(r, at[r]) IN
    /\ pc[r] = "snapshot"
    /\ IF AbortedAt(calls[r])
        THEN Finish(r, Out("aborted")) /\ UNCHANGED <<calls, afterAbort, undecided, todo>>
        ELSE
        /\ Called(r)
        /\ Undecided(r, "snapshot", s.kind)
        /\ IF Flaw # "noCheckAfterSnapshot" /\ AbortedAt(calls[r] + 1)
            THEN Finish(r, Out("aborted")) /\ UNCHANGED todo
           ELSE IF s.kind # "ok" THEN Finish(r, Out(SnapFailure(r, s.kind))) /\ UNCHANGED todo
           ELSE IF s.mat # pinned[r].mat \/ at[r] # pinned[r].id
            THEN Finish(r, Out(IF byBasis[r] THEN "basis-unavailable" ELSE "adopted-material-changed"))
                 /\ UNCHANGED todo
           ELSE CASE req.op = "list" ->
                        Finish(r, [Out("ok") EXCEPT !.id = pinned[r].id, !.mat = pinned[r].mat,
                                   !.content = {<<at[r], s.mat, p>> : p \in Entries(s.mat) \ {"SKILL"}}])
                        /\ UNCHANGED todo
                  [] req.op = "read" /\ PathOf(req.part) \notin Entries(s.mat) ->
                        Finish(r, Out("resource-missing")) /\ UNCHANGED todo
                  [] req.op = "read" ->
                        /\ todo' = [todo EXCEPT ![r] = <<PathOf(req.part)>>]
                        /\ pc' = [pc EXCEPT ![r] = "open"] /\ UNCHANGED out
                  [] OTHER ->
                        /\ todo' = [todo EXCEPT ![r] = EntrySeq(s.mat)]
                        /\ pc' = [pc EXCEPT ![r] = "open"] /\ UNCHANGED out
    /\ UNCHANGED <<shared, pinned, byBasis, content, at, pending, checked, verdict, order>>

Open(r) ==
    LET p == Head(todo[r])
        a == OpenAnswer(r, at[r], p)
    IN
    /\ pc[r] = "open"
    /\ IF AbortedAt(calls[r])
        THEN Finish(r, Out("aborted")) /\ UNCHANGED <<calls, afterAbort, undecided, todo, content>>
        ELSE
        /\ Called(r)
        /\ Undecided(r, "open", a.kind)
        /\ IF AbortedAt(calls[r] + 1) THEN Finish(r, Out("aborted")) /\ UNCHANGED <<todo, content>>
           ELSE IF a.kind # "ok" THEN Finish(r, Out(OpenFailure(r, a.kind))) /\ UNCHANGED <<todo, content>>
           ELSE IF Flaw # "noEntryDigest"
                   /\ EntryDigest(at[r], a.mat, p) # EntryDigest(pinned[r].id, pinned[r].mat, p)
            THEN Finish(r, Out("version-changed")) /\ UNCHANGED <<todo, content>>
           ELSE LET got == content[r] \cup {<<at[r], a.mat, p>>} IN
                /\ content' = [content EXCEPT ![r] = got]
                /\ todo' = [todo EXCEPT ![r] = Tail(@)]
                /\ IF Len(todo[r]) = 1
                    THEN Finish(r, [Out("ok") EXCEPT !.id = pinned[r].id, !.mat = pinned[r].mat,
                                    !.content = got])
                    ELSE UNCHANGED <<pc, out>>
    /\ UNCHANGED <<shared, pinned, byBasis, at, pending, checked, verdict, order>>

(* SkillCatalog: the lawful set, then the read checks of the kept identities,
   which complete in any order. *)
LawfulSet(r) ==
    /\ pc[r] = "lawful"
    /\ Called(r)
    /\ Undecided(r, "lawful", IF fault.call = "lawful" THEN "undecided" ELSE "ok")
    /\ IF fault.call = "lawful"
        THEN Finish(r, IF Flaw = "unknownAsEmpty" THEN Out("ok") ELSE Out("unknown"))
             /\ UNCHANGED pending
        ELSE LET kept == {t \in Ids : Known(r, t)} \cap (IF req.all THEN Ids ELSE req.keep) IN
             IF kept = {} THEN Finish(r, Out("ok")) /\ UNCHANGED pending
             ELSE /\ pending' = [pending EXCEPT ![r] = kept]
                  /\ pc' = [pc EXCEPT ![r] = "checks"] /\ UNCHANGED out
    /\ UNCHANGED <<shared, pinned, byBasis, todo, content, at, checked, verdict, order>>

EntryKind(t) == IF w.st[t] = "standin" THEN "stand-in" ELSE "adopted"

CompleteCheck(r, t) ==
    LET v == CheckAnswer(r, t)
        vs == [verdict[r] EXCEPT ![t] = v]
        chk == checked[r] \cup {t}
        ord == Append(order[r], t)
        listed == SelectSeq(IF Flaw = "completionOrder" THEN ord ELSE IdSeq,
                            LAMBDA i : i \in chk /\ vs[i] = "granted")
    IN
    /\ pc[r] = "checks"
    /\ t \in pending[r]
    /\ Called(r)
    /\ Undecided(r, "check", v)
    /\ verdict' = [verdict EXCEPT ![r] = vs]
    /\ checked' = [checked EXCEPT ![r] = chk]
    /\ order' = [order EXCEPT ![r] = ord]
    /\ pending' = [pending EXCEPT ![r] = @ \ {t}]
    /\ IF pending[r] = {t}
        THEN IF \E i \in chk : vs[i] = "undecided"
                THEN Finish(r, IF Flaw = "unknownAsEmpty" THEN Out("ok") ELSE Out("unknown"))
                ELSE Finish(r, [Out("ok") EXCEPT
                        !.entries = [i \in 1..Len(listed) |-> <<listed[i], EntryKind(listed[i])>>]])
        ELSE UNCHANGED <<pc, out>>
    /\ UNCHANGED <<shared, pinned, byBasis, todo, content, at>>

Done == /\ \A r \in Runs : pc[r] = "done"
        /\ UNCHANGED vars

Next ==
    \/ \E r \in Runs : Start(r) \/ Check(r) \/ Resolve(r) \/ ResolveMisdirected(r)
                      \/ Snapshot(r) \/ Open(r) \/ LawfulSet(r)
    \/ \E r \in Runs, t \in Ids : CompleteCheck(r, t)
    \/ Done

Init ==
    /\ req \in Requests
    /\ w \in Worlds
    /\ variant \in VariantPairs
    /\ fault \in {FaultOf(n) : n \in FaultNames}
    /\ smode \in SourceModes
    /\ abortAt \in AbortPoints
    /\ changeAt \in ChangePoints
    /\ pc = [r \in Runs |-> IF Mode = "single" /\ r = 2 THEN "done" ELSE "start"]
    /\ out = [r \in Runs |-> NoOut]
    /\ calls = [r \in Runs |-> 0]
    /\ afterAbort = [r \in Runs |-> 0]
    /\ undecided = [r \in Runs |-> ""]
    /\ pinned = [r \in Runs |-> NoPin]
    /\ byBasis = [r \in Runs |-> FALSE]
    /\ todo = [r \in Runs |-> <<>>]
    /\ content = [r \in Runs |-> {}]
    /\ at = [r \in Runs |-> "-"]
    /\ pending = [r \in Runs |-> {}]
    /\ checked = [r \in Runs |-> {}]
    /\ verdict = [r \in Runs |-> [t \in Ids |-> "-"]]
    /\ order = [r \in Runs |-> <<>>]

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* Properties.                                                             *)
(***************************************************************************)
Kinds == {"-", "ok", "not-available-to-you", "unavailable-stand-in", "bad-path",
          "resource-missing", "basis-unavailable", "adopted-material-changed",
          "version-changed", "source-unavailable", "unsupported", "aborted", "unknown"}

TypeOK ==
    /\ pc \in [Runs -> {"start", "check", "resolve", "snapshot", "open", "lawful", "checks", "done"}]
    /\ \A r \in Runs : out[r].kind \in Kinds
    /\ calls \in [Runs -> 0..10]
    /\ afterAbort \in [Runs -> 0..10]
    /\ at \in [Runs -> Ids \cup {"-"}]

Finished(r) == pc[r] = "done" /\ (Mode = "single" => r = 1)
Pinned == IF req.basis = NoBasis THEN w.cur[req.target] ELSE req.basis.mat

(* S1 (Mode "twin") and S5 (Mode "same"): one observation in both runs. *)
SameObservation == (Mode # "single" /\ \A r \in Runs : pc[r] = "done") => out[1] = out[2]

(* S2: the first undecided port answer decides the whole answer: `unknown` for the
   read check, the resolution and the lawful set, `source-unavailable` for the
   source. Nothing that looks complete. *)
WholeUnknown ==
    \A r \in Runs : (Finished(r) /\ undecided[r] # "" /\ out[r].kind # "aborted") =>
        out[r].kind = IF undecided[r] \in {"check", "resolve", "lawful"}
                        THEN "unknown" ELSE "source-unavailable"

(* S3: every delivered piece has the bytes of the pinned material; list gives the
   entries of that material only; export gives every entry or nothing. *)
NoMixedVersion ==
    \A r \in Runs : (Finished(r) /\ out[r].kind = "ok" /\ req.op \in {"read", "list", "export"}) =>
        /\ out[r].mat = Pinned
        /\ \A c \in out[r].content :
                EntryDigest(c[1], c[2], c[3]) = EntryDigest(req.target, Pinned, c[3])
        /\ req.op = "list" => \A c \in out[r].content : c[2] = Pinned
        /\ req.op = "export" => {c[3] : c \in out[r].content} = Entries(Pinned)
NoContentOnFailure ==
    \A r \in Runs : (Finished(r) /\ out[r].kind # "ok") => out[r].content = {} /\ out[r].entries = <<>>

(* S7: a success of an access operation names the requested identity, and
   every delivered piece is a piece of a material of that identity. *)
OwnMaterialOnly ==
    \A r \in Runs : (Finished(r) /\ out[r].kind = "ok" /\ req.op \in AccessOps) =>
        /\ out[r].id = req.target
        /\ \A c \in out[r].content : c[1] = req.target

(* S6: no port call after the abort; an operation aborted before it answered
   gives `aborted` (or a failure that needed no port) and no content. *)
AbortStops ==
    \A r \in Runs :
        /\ afterAbort[r] = 0
        /\ (Finished(r) /\ AbortedAt(calls[r])) =>
                \/ out[r].kind = "aborted"
                \/ calls[r] = 0 /\ out[r].kind = "not-available-to-you"
=============================================================================
