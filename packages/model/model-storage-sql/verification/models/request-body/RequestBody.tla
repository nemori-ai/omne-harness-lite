---------------------------- MODULE RequestBody ----------------------------
(* The request body of one Model call on a store whose transactions have a
   bounded size. The body has no bound, so it is written as chunks in several
   transactions before the admission. The rule under check:

     The chunks are keyed by the call and the digest of the request. The
     admission is one transaction: it inserts the call only when every chunk
     of its digest is present. A process that starts deletes the chunks that
     no call owns, before it admits anything. The release of a call deletes
     its chunks in the transaction that marks the material released. An
     admission that inserts no call (the call exists) deletes the chunks of
     its attempt that the call does not own.

   So a call that exists and holds its material has its complete body, a
   repeated admission makes no second body, and chunks that nobody will own
   do not stay. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Chunks,        \* chunk sequence numbers of one body, for example {1, 2}
          MaxCrashes,    \* process crashes
          MaxUnknown,    \* transaction answers that are lost
          AdmitUnchecked,   \* negative control: the admission does not look at the chunks
          SweepLive,        \* negative control: the sweep also runs while an admission is in flight
          KeyWithoutDigest, \* negative control: the chunks are keyed by the call only
          KeepOnReplay      \* negative control: an admission that inserts no call keeps its chunks

Digests == {"d1", "d2"}   \* d2: the same call id with another input (a conflict in the contract)

VARIABLES chunks,    \* set of <<digest, seq>> rows of the one call id
          call,      \* "none", or the digest the call was admitted with
          held,      \* whether the admitted call still holds its material
          caller,    \* [phase, digest, written]: the admission in flight of this process
          started,   \* whether the process finished its start sweep
          crashes, unknowns

vars == <<chunks, call, held, caller, started, crashes, unknowns>>

Idle == [phase |-> "idle", digest |-> "d1"]
Key(d, i) == IF KeyWithoutDigest THEN <<"any", i>> ELSE <<d, i>>
Complete(d) == \A i \in Chunks : Key(d, i) \in chunks

Init == /\ chunks = {} /\ call = "none" /\ held = FALSE
        /\ caller = Idle /\ started = FALSE /\ crashes = 0 /\ unknowns = 0

(* The process starts: it deletes every chunk that no admitted call owns. *)
StartSweep ==
  /\ ~started
  /\ chunks' = IF call # "none" /\ held THEN {k \in chunks : k[1] = Key(call, 1)[1]} ELSE {}
  /\ started' = TRUE
  /\ UNCHANGED <<call, held, caller, crashes, unknowns>>

(* The caller begins an admission with one of the two inputs. *)
Begin ==
  /\ started /\ caller.phase = "idle"
  /\ \E d \in Digests : caller' = [phase |-> "writing", digest |-> d]
  /\ UNCHANGED <<chunks, call, held, started, crashes, unknowns>>

(* One transaction writes one chunk. Writing a chunk that is present changes nothing. The answer
   may be lost; the caller then writes the chunk again. *)
Put ==
  /\ caller.phase = "writing"
  /\ \E i \in Chunks :
       /\ chunks' = chunks \cup {Key(caller.digest, i)}
       /\ \/ UNCHANGED unknowns
          \/ /\ unknowns < MaxUnknown /\ unknowns' = unknowns + 1
  /\ UNCHANGED <<call, held, caller, started, crashes>>

(* The admission: one transaction. *)
Admit ==
  /\ caller.phase = "writing"
  /\ IF call # "none"
       THEN \* the call exists: the same input is recognised, another input conflicts.
            \* The transaction deletes the chunks of this attempt that the call does not own.
            /\ caller' = Idle /\ UNCHANGED <<call, held>>
            /\ chunks' = IF KeepOnReplay \/ (held /\ call = caller.digest)
                            THEN chunks
                            ELSE {k \in chunks : k[1] # Key(caller.digest, 1)[1]}
       ELSE IF AdmitUnchecked \/ Complete(caller.digest)
         THEN /\ call' = caller.digest /\ held' = TRUE /\ caller' = Idle /\ UNCHANGED chunks
         ELSE \* body incomplete: refused for good, the caller writes the chunks again
              /\ UNCHANGED <<call, held, chunks, caller>>
  /\ UNCHANGED <<started, crashes, unknowns>>

(* The consumer acknowledged the result and the cleanup releases the material. *)
Release ==
  /\ call # "none" /\ held
  /\ held' = FALSE
  /\ chunks' = {k \in chunks : k[1] # Key(call, 1)[1]}
  /\ UNCHANGED <<call, caller, started, crashes, unknowns>>

(* The process crashes: the admission in flight is forgotten, the store stays. *)
Crash ==
  /\ crashes < MaxCrashes /\ crashes' = crashes + 1
  /\ caller' = Idle /\ started' = FALSE
  /\ UNCHANGED <<chunks, call, held, unknowns>>

(* Negative control: a sweep while the process runs. *)
LiveSweep ==
  /\ SweepLive /\ started
  /\ chunks' = IF call # "none" /\ held THEN {k \in chunks : k[1] = Key(call, 1)[1]} ELSE {}
  /\ UNCHANGED <<call, held, caller, started, crashes, unknowns>>

Next == StartSweep \/ Begin \/ Put \/ Admit \/ Release \/ Crash \/ LiveSweep
Spec == Init /\ [][Next]_vars /\ WF_vars(StartSweep) /\ WF_vars(Begin) /\ WF_vars(Admit)
             /\ \A i \in Chunks : SF_vars(Put /\ Key(caller.digest, i) \in chunks')

(* Safety. *)
\* A call that holds its material has every chunk of its own digest.
BodyComplete == (call # "none" /\ held) => \A i \in Chunks : <<call, i>> \in chunks
\* While no admission is in flight, every chunk belongs to the admitted call that holds its
\* material. So a released call has no chunk, and no chunk is an orphan.
NoOrphanAtRest ==
  (started /\ caller.phase = "idle") =>
    \A k \in chunks : call # "none" /\ held /\ k[1] = call

(* Liveness: an admission that the caller keeps asking for is decided. *)
Decided == []<>(caller.phase = "idle")
=============================================================================
