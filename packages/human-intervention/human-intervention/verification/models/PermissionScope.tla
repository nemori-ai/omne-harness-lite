-------------------------- MODULE PermissionScope --------------------------
EXTENDS Naturals, TLC
CONSTANT Bad
VARIABLES scope, liveSession, prohibited, revoked, revision, adopted,
          uses, illegalDeny, illegalScope, illegalBinding, illegalStale
vars == <<scope, liveSession, prohibited, revoked, revision, adopted,
          uses, illegalDeny, illegalScope, illegalBinding, illegalStale>>
Init == /\ scope = "none" /\ liveSession = TRUE /\ prohibited = FALSE
        /\ revoked = FALSE /\ revision = 0 /\ adopted = 0 /\ uses = 0
        /\ illegalDeny = FALSE /\ illegalScope = FALSE
        /\ illegalBinding = FALSE /\ illegalStale = FALSE
Grant(k) == /\ scope = "none" /\ scope' = k
            /\ UNCHANGED <<liveSession, prohibited, revoked, revision, adopted,
                 uses, illegalDeny, illegalScope, illegalBinding, illegalStale>>
Change == /\ revision = 0 /\ revision' = 1 /\ revoked' = TRUE
          /\ UNCHANGED <<scope, liveSession, prohibited, adopted, uses,
               illegalDeny, illegalScope, illegalBinding, illegalStale>>
Prohibit == /\ ~prohibited /\ prohibited' = TRUE
            /\ UNCHANGED <<scope, liveSession, revoked, revision, adopted, uses,
                 illegalDeny, illegalScope, illegalBinding, illegalStale>>
EndSession == /\ liveSession /\ liveSession' = FALSE
              /\ UNCHANGED <<scope, prohibited, revoked, revision, adopted, uses,
                   illegalDeny, illegalScope, illegalBinding, illegalStale>>
Matches(t,s) == t = "own" /\ (scope # "session" \/ (s = "original" /\ liveSession))
Execute(t,s,a) ==
  /\ scope # "none" /\ uses < 2
  /\ (~prohibited \/ Bad = "deny")
  /\ ((~revoked /\ revision = adopted) \/ Bad = "stale")
  /\ (Matches(t,s) \/ Bad = "scope")
  /\ (a = "original" \/ Bad = "binding")
  /\ (scope # "once" \/ uses = 0 \/ Bad = "once")
  /\ uses' = uses + 1
  /\ illegalDeny' = (illegalDeny \/ prohibited)
  /\ illegalScope' = (illegalScope \/ ~Matches(t,s))
  /\ illegalBinding' = (illegalBinding \/ a # "original")
  /\ illegalStale' = (illegalStale \/ revoked \/ revision # adopted)
  /\ UNCHANGED <<scope, liveSession, prohibited, revoked, revision, adopted>>
Next == (\E k \in {"once","session","tenant"}: Grant(k))
        \/ Change \/ Prohibit \/ EndSession
        \/ (\E t \in {"own","foreign"},s \in {"original","other"},a \in {"original","changed"}: Execute(t,s,a))
        \/ UNCHANGED vars
NoBypassDeny == ~illegalDeny
ScopeBound == ~illegalScope
OriginalBinding == ~illegalBinding
CurrentAuthority == ~illegalStale
OnceOnly == scope = "once" => uses <= 1
Spec == Init /\ [][Next]_vars
=============================================================================
