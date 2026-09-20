---------------------------- MODULE Provisional ----------------------------
EXTENDS Naturals
CONSTANT Mutation
Nodes == {1, 2}
VARIABLES decision, product
vars == <<decision, product>>
Init == /\ decision = [n \in Nodes |-> "pending"]
        /\ product = [n \in Nodes |-> "staged"]
Answer(n,a) == /\ decision[n] = "pending" /\ a \in {"approve", "reject"}
               /\ decision' = [decision EXCEPT ![n] = a]
               /\ UNCHANGED product
\* Node 2 depends on 1. Parent rejection forbids further use immediately.
Finalize(n) == /\ decision[n] = "approve" /\ product[n] = "staged"
               /\ (n = 1 \/ product[1] = "final" \/ Mutation = "parent")
               /\ product' = [product EXCEPT ![n] = "final"]
               /\ UNCHANGED decision
Undo(n) == /\ product[n] = "staged"
           /\ (decision[n] = "reject" \/ (n = 2 /\ decision[1] = "reject"))
           /\ (n = 2 \/ product[2] # "staged")
           /\ product' = [product EXCEPT ![n] = "revoked"]
           /\ UNCHANGED decision
Next == (\E n \in Nodes, a \in {"approve", "reject"} : Answer(n,a)) \/
        (\E n \in Nodes : Finalize(n) \/ Undo(n))
Spec == Init /\ [][Next]_vars
DependencyFinalized == product[2] = "final" => product[1] = "final"
RejectedNotFinal == \A n \in Nodes : decision[n] = "reject" => product[n] # "final"
=============================================================================
