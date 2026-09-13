----------------------------- MODULE RuntimeMC -----------------------------
EXTENDS Runtime
CONSTANTS a1, a2, a3, A, sa, sb, sc
TenantAssignment == [i \in Instances |-> IF i \in {a1, a2, a3} THEN A ELSE CHOOSE t \in Tenants : t # A]
SessionAssignment == [i \in Instances |-> IF i \in {a1, a2} THEN sa ELSE IF i = a3 THEN sb ELSE sc]
SessionTenantAssignment == [s \in Sessions |-> IF s \in {sa, sb} THEN A ELSE CHOOSE t \in Tenants : t # A]
=============================================================================
