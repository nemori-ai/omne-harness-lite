------------------------------ MODULE MCPoints ------------------------------
EXTENDS Points

\* 一个小世界：
\*   host 声明两个拓展点 p 与 q，q 的键取自 p。
\*   a、b、c 注入 host。a 与 b 在 p 的 k1 上冲突。
\*   a1 在 a 的作用域里，和 c 在 q 的 k2 上冲突。
F == {"host", "a", "b", "c", "a1"}
P == {"p", "q"}
K == {"k1", "k2"}

MCParent   == [f \in F |-> IF f = "a1" THEN "a" ELSE "nofiber"]
MCRequires == [f \in F |-> IF f \in {"a", "b", "c"} THEN {"host"} ELSE {}]
MCHosts    == [f \in F |-> IF f = "host" THEN {"p", "q"} ELSE {}]
MCContrib  ==
  [f \in F |->
    CASE f = "host" -> {}
      [] f = "a"    -> {<<"p", "k1">>}
      [] f = "b"    -> {<<"p", "k1">>, <<"p", "k2">>}
      [] f = "c"    -> {<<"q", "k1">>, <<"q", "k2">>}
      [] f = "a1"   -> {<<"q", "k2">>}]
MCKeyFrom  == [p \in P |-> IF p = "q" THEN "p" ELSE "nopoint"]
MCRank     == [f \in F |-> CASE f = "host" -> 0 [] f = "a" -> 1 [] f = "b" -> 2
                             [] f = "c" -> 3 [] f = "a1" -> 4]

\* 依赖成环的世界：a 与 b 互相注入
MCRequiresCyclic ==
  [f \in F |-> CASE f = "a" -> {"host", "b"} [] f = "b" -> {"host", "a"}
                 [] f = "c" -> {"host"} [] OTHER -> {}]
NeverA == "a" \notin LiveFibers
=============================================================================
