---------------------------- MODULE Authorization ----------------------------
(***************************************************************************)
(* One OAuth grant of one MCP endpoint holding, as MCP authorization keeps *)
(* it: a person begins a connection (a pending authorization with a state  *)
(* value, a PKCE verifier and the issuer recorded before the browser       *)
(* opens); a callback arrives, from the authorization server or from       *)
(* anybody else; the code is exchanged for tokens; requests use the access *)
(* token; an expired token is refreshed with the refresh token, which the  *)
(* authorization server replaces at every successful refresh.              *)
(*                                                                         *)
(* The properties are I9 and I10 of the MCP SPEC and two rules of the      *)
(* grant: an unknown outcome of a refresh removes nothing, and a grant     *)
(* asks for a new connection only after the authorization server refused.  *)
(* The model moves when the SPEC's member `mcp-authorization` is created.  *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets

CONSTANTS
  MaxStates,   \* connections a person may begin
  Users,       \* requests that want the token at the same time
  MaxRefresh,  \* refreshes the authorization server answers
  Bugs         \* deliberate faults of a negative control; {} is the design

BugNames == {"stale-state", "skip-iss", "exchange-twice", "parallel-refresh",
             "wipe-on-unknown", "reconnect-on-unknown"}
ASSUME Bugs \subseteq BugNames

VARIABLES
  grant,       \* "none" | "valid" | "reconnect"
  issued,      \* state values of pending authorizations made so far: 1..issued
  live,        \* the state value of the pending authorization that stands; 0 for none
  exchanges,   \* per state value: token requests sent for it
  badExchange, \* TRUE once a code was exchanged that should not have been
  expired,     \* TRUE: the access token held is past its time
  asRefresh,   \* the refresh token the authorization server accepts now (a counter)
  heldRefresh, \* the refresh token omne holds
  inFlight,    \* refresh requests on their way
  maxInFlight, \* the most there ever were at once
  refreshes,   \* refreshes the authorization server answered
  refused,     \* TRUE once the authorization server refused a refresh
  wiped,       \* TRUE once a refresh of unknown outcome removed the grant's tokens
  users        \* per user: "idle" | "waiting" | "done"

vars == <<grant, issued, live, exchanges, badExchange, expired, asRefresh, heldRefresh,
          inFlight, maxInFlight, refreshes, refused, wiped, users>>

States == 1..MaxStates

Init ==
  /\ grant = "none" /\ issued = 0 /\ live = 0 /\ exchanges = [s \in States |-> 0]
  /\ badExchange = FALSE /\ expired = FALSE /\ asRefresh = 0 /\ heldRefresh = 0
  /\ inFlight = 0 /\ maxInFlight = 0 /\ refreshes = 0 /\ refused = FALSE /\ wiped = FALSE
  /\ users = [u \in Users |-> "idle"]

\* A person begins a connection: a new pending authorization replaces the one that stood.
Begin ==
  /\ issued < MaxStates /\ issued' = issued + 1 /\ live' = issued + 1
  /\ UNCHANGED <<grant, exchanges, badExchange, expired, asRefresh, heldRefresh, inFlight,
                 maxInFlight, refreshes, refused, wiped, users>>

\* A callback arrives with any state value that was ever issued and an issuer that is
\* right or wrong. The code is exchanged only for the pending authorization that stands
\* and only with the right issuer; the exchange uses the pending authorization up.
Callback(s, goodIss) ==
  /\ s \in 1..issued
  /\ LET standing == s = live \/ ("stale-state" \in Bugs)
         checked == goodIss \/ ("skip-iss" \in Bugs)
     IN IF standing /\ checked
        THEN /\ exchanges' = [exchanges EXCEPT ![s] = @ + 1]
             /\ badExchange' = (badExchange \/ s # live \/ ~goodIss)
             /\ live' = IF "exchange-twice" \in Bugs THEN live ELSE 0
             /\ IF goodIss /\ s = live
                THEN grant' = "valid" /\ expired' = FALSE
                     /\ asRefresh' = asRefresh + 1 /\ heldRefresh' = asRefresh + 1
                ELSE UNCHANGED <<grant, expired, asRefresh, heldRefresh>>
        ELSE /\ live' = IF s = live THEN 0 ELSE live
             /\ UNCHANGED <<grant, exchanges, badExchange, expired, asRefresh, heldRefresh>>
  /\ UNCHANGED <<issued, inFlight, maxInFlight, refreshes, refused, wiped, users>>

Expire ==
  /\ grant = "valid" /\ ~expired /\ expired' = TRUE
  /\ UNCHANGED <<grant, issued, live, exchanges, badExchange, asRefresh, heldRefresh, inFlight,
                 maxInFlight, refreshes, refused, wiped, users>>

\* A request wants the token. A token in time is used at once. A token past its time is
\* refreshed first: one refresh is on its way at a time, the others wait for its outcome.
Use(u) ==
  /\ users[u] = "idle" /\ grant = "valid"
  /\ IF ~expired
     THEN users' = [users EXCEPT ![u] = "done"] /\ UNCHANGED <<inFlight, maxInFlight>>
     ELSE /\ users' = [users EXCEPT ![u] = "waiting"]
          /\ IF inFlight = 0 \/ "parallel-refresh" \in Bugs
             THEN inFlight' = inFlight + 1
                  /\ maxInFlight' = IF inFlight + 1 > maxInFlight THEN inFlight + 1
                                     ELSE maxInFlight
             ELSE UNCHANGED <<inFlight, maxInFlight>>
  /\ UNCHANGED <<grant, issued, live, exchanges, badExchange, expired, asRefresh, heldRefresh,
                 refreshes, refused, wiped>>

Waiters == {u \in Users : users[u] = "waiting"}
Release == [u \in Users |-> IF users[u] = "waiting" THEN "done" ELSE users[u]]

\* The authorization server answers the refresh: it accepts the token it expects and
\* replaces it, or it refuses.
RefreshAnswered ==
  /\ inFlight > 0 /\ refreshes < MaxRefresh
  /\ inFlight' = inFlight - 1 /\ refreshes' = refreshes + 1
  /\ IF heldRefresh = asRefresh /\ grant = "valid"
     THEN /\ asRefresh' = asRefresh + 1 /\ heldRefresh' = asRefresh + 1
          /\ expired' = FALSE /\ users' = Release
          /\ UNCHANGED <<grant, refused>>
     ELSE /\ refused' = TRUE /\ grant' = IF grant = "valid" THEN "reconnect" ELSE grant
          /\ users' = Release
          /\ UNCHANGED <<asRefresh, heldRefresh, expired>>
  /\ UNCHANGED <<issued, live, exchanges, badExchange, maxInFlight, wiped>>

\* The refresh has no answer. Nothing is known, not even whether the authorization server
\* replaced the refresh token: the tokens stay, the requests that waited are told the
\* outcome is unknown. (A refresh on its way is not tied here to the token it was sent
\* with; the properties below do not depend on it.)
RefreshUnknown ==
  /\ inFlight > 0
  /\ inFlight' = inFlight - 1 /\ users' = Release
  /\ asRefresh' \in {asRefresh, asRefresh + 1}
  /\ IF "wipe-on-unknown" \in Bugs
     THEN wiped' = TRUE /\ heldRefresh' = 0 /\ UNCHANGED grant
     ELSE IF "reconnect-on-unknown" \in Bugs
          THEN grant' = "reconnect" /\ UNCHANGED <<wiped, heldRefresh>>
          ELSE UNCHANGED <<grant, wiped, heldRefresh>>
  /\ UNCHANGED <<issued, live, exchanges, badExchange, expired, maxInFlight, refreshes,
                 refused>>

Disconnect ==
  /\ grant # "none" /\ inFlight = 0
  /\ grant' = "none" /\ live' = 0 /\ heldRefresh' = 0 /\ expired' = FALSE
  /\ UNCHANGED <<issued, exchanges, badExchange, asRefresh, inFlight, maxInFlight, refreshes,
                 refused, wiped, users>>

Next == Begin \/ (\E s \in States, g \in BOOLEAN : Callback(s, g)) \/ Expire
        \/ (\E u \in Users : Use(u)) \/ RefreshAnswered \/ RefreshUnknown \/ Disconnect

Spec == Init /\ [][Next]_vars

TypeOK == grant \in {"none", "valid", "reconnect"} /\ live \in 0..MaxStates

\* I9: a code is exchanged only for the pending authorization that stands, after the
\* issuer was checked, and at most once.
I9_ExchangeChecked == ~badExchange
I9_ExchangeOnce == \A s \in States : exchanges[s] <= 1
\* I10: one refresh on its way at a time.
I10_OneRefresh == maxInFlight <= 1
\* An unknown outcome removes nothing.
P_UnknownKeeps == ~wiped
\* A grant asks for a new connection only after the authorization server refused.
P_ReconnectAfterRefusal == grant = "reconnect" => refused
=============================================================================
