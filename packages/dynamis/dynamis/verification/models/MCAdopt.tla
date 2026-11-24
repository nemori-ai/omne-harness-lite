------------------------------ MODULE MCAdopt ------------------------------
EXTENDS Adopt
\* 记忆这个点上：vector 一份，graph 两家（用来撞键）
I == {"vector-a", "graph-a", "graph-b"}
K == [i \in I |-> IF i = "vector-a" THEN "vector" ELSE "graph"]
D == {"researcher", "coder"}
W == [d \in D |-> IF d = "researcher" THEN <<"graph">> ELSE <<"vector">>]
=============================================================================
