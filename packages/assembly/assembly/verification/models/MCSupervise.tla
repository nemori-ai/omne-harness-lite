----------------------------- MODULE MCSupervise -----------------------------
EXTENDS Supervise
R == {"store", "session", "access"}
N == [r \in R |-> IF r = "session" THEN {"store"} ELSE IF r = "access" THEN {"session"} ELSE {}]
None == {}
F == {"store", "session"}
BadSession == {"session"}
OkAccess == {"access"}
OkAll == {"session", "access"}
=============================================================================
