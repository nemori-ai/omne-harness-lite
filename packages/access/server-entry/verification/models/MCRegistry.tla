---- MODULE MCRegistry ----
EXTENDS AccessRegistry
EffectDef == [c \in Calls |-> IF c = "c2" THEN "commit" ELSE "read"]
====
