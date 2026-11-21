------------------------------- MODULE Adopt -------------------------------
(***************************************************************************)
(* 同一个拓展点上并存几份实现，不同的定义各要各的。                        *)
(*                                                                         *)
(* 一个点上有几份实现，每份落在一个键下（例如记忆的 vector 与 graph）。    *)
(* 一份定义（例如一种 agent）点名它要的键，可以写几个，先具体后一般。      *)
(* 采用点上把点名的键解析成一个实例，记进这一轮；这一轮的每次调用按记下的  *)
(* 取。实现在运行中来去，也会换代。                                        *)
(*                                                                         *)
(* 要回答的问题：两种定义能不能同时各用各的实现；正在跑的一轮会不会半路    *)
(* 换了实现；一份定义会不会用上它没点名的实现。                            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Impls,     \* 带来实现的 fiber
  KeyOf,     \* 每份实现落在哪个键下
  Defs,      \* 定义
  Want,      \* 每份定义点名的键，一个序列，先具体后一般
  Rule,      \* "pin"：采用点解析并钉住，调用按钉住的现取
             \* "bind-at-call"：每次调用重新解析
             \* "any-fallback"：点名的都没有时，随便拿一份在场的顶上
             \* "single-slot"：一个点同时只容一份实现（Cordis 服务的做法），谁在就用谁
  MaxGen, MaxRuns,
  NoInst

VARIABLES
  gen,       \* 每份实现装过几代
  live,      \* 在场的实例
  runs,      \* 每一轮：哪份定义，钉住了哪个实例，状态
  seen       \* 每一轮真的在哪些实例上执行过

vars == <<gen, live, runs, seen>>

Instances == Impls \X (1..MaxGen)
Runs == 1..MaxRuns

At(key, L) == {i \in L : KeyOf[i[1]] = key}
Min(S) == CHOOSE n \in S : \A m \in S : n <= m

\* 解析：只由在场的集合与点名的键决定
Resolve(keys, L) ==
  LET hits == {n \in 1..Len(keys) : At(keys[n], L) # {}}
  IN  IF hits = {} THEN <<"none", NoInst>>
      ELSE LET found == At(keys[Min(hits)], L)
           IN  IF Cardinality(found) = 1
               THEN <<"one", CHOOSE i \in found : TRUE>>
               ELSE <<"conflict", NoInst>>

\* 这条规则下，一份定义此刻可以绑到的实例
Bindable(d) ==
  CASE Rule = "single-slot" -> live
    [] Rule = "any-fallback" ->
         LET a == Resolve(Want[d], live)
         IN  IF a[1] = "one" THEN {a[2]}
             ELSE IF a[1] = "none" THEN live ELSE {}
    [] OTHER ->
         LET a == Resolve(Want[d], live)
         IN  IF a[1] = "one" THEN {a[2]} ELSE {}

Init ==
  /\ gen = [i \in Impls |-> 0]
  /\ live = {}
  /\ runs = [r \in Runs |-> [def |-> CHOOSE d \in Defs : TRUE, bind |-> NoInst, st |-> "free"]]
  /\ seen = [r \in Runs |-> {}]

Load(i) ==
  /\ gen[i] < MaxGen
  /\ \A g \in 1..MaxGen : <<i, g>> \notin live
  /\ (Rule = "single-slot") => (live = {})
  /\ gen' = [gen EXCEPT ![i] = @ + 1]
  /\ live' = live \cup {<<i, gen[i] + 1>>}
  /\ UNCHANGED <<runs, seen>>

Unload(inst) ==
  /\ inst \in live
  /\ live' = live \ {inst}
  /\ UNCHANGED <<gen, runs, seen>>

\* 采用：解析不成一个实例时整份不可用，这一轮不开始
AdoptRun(d, r) ==
  /\ runs[r].st = "free"
  /\ \E inst \in Bindable(d) :
       runs' = [runs EXCEPT ![r] = [def |-> d, bind |-> inst, st |-> "running"]]
  /\ UNCHANGED <<gen, live, seen>>

\* 一次调用。钉住的实例不在了，这次调用答依据不可用，不记执行
Call(r) ==
  /\ runs[r].st = "running"
  /\ \E inst \in (IF Rule = "bind-at-call" THEN Bindable(runs[r].def)
                  ELSE {runs[r].bind} \cap live) :
       seen' = [seen EXCEPT ![r] = @ \cup {inst}]
  /\ UNCHANGED <<gen, live, runs>>

Finish(r) ==
  /\ runs[r].st = "running"
  /\ runs' = [runs EXCEPT ![r].st = "done"]
  /\ UNCHANGED <<gen, live, seen>>

Next ==
  \/ \E i \in Impls : Load(i)
  \/ \E inst \in Instances : Unload(inst)
  \/ \E d \in Defs, r \in Runs : AdoptRun(d, r)
  \/ \E r \in Runs : Call(r) \/ Finish(r)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
Named(d) == {Want[d][n] : n \in 1..Len(Want[d])}

\* 一轮只在一个实例上执行：不半路换实现，也不半路换代
Pinned == \A r \in Runs : Cardinality(seen[r]) <= 1

\* 一轮只在它的定义点名过的键上执行：不悄悄换成别的
OnlyNamed == \A r \in Runs : \A inst \in seen[r] : KeyOf[inst[1]] \in Named(runs[r].def)

\* 见证用：两轮同时在跑，各自钉住的实例都在场，而且落在不同的键下
Coexist ==
  \E r1, r2 \in Runs :
    /\ r1 # r2 /\ runs[r1].st = "running" /\ runs[r2].st = "running"
    /\ runs[r1].bind \in live /\ runs[r2].bind \in live
    /\ KeyOf[runs[r1].bind[1]] # KeyOf[runs[r2].bind[1]]
NeverCoexist == ~Coexist
=============================================================================
