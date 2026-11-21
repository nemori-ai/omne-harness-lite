------------------------------- MODULE Points -------------------------------
(***************************************************************************)
(* 拓展点的登记。                                                          *)
(*                                                                         *)
(* 单元是 fiber。一个 fiber 声明四样：它在谁的作用域里（Parent），它注入谁 *)
(* （Requires），它声明哪些拓展点（Hosts），它往哪些拓展点的哪些键里放贡献 *)
(* （Contrib）。                                                           *)
(*                                                                         *)
(* 要回答的问题：拓展点此刻给出的答案，是不是只由「现在要哪些 fiber」决定，*)
(* 与它们装上、卸下的先后无关。                                            *)
(***************************************************************************)
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Fibers, Points, Keys,
  NoFiber, NoPoint,
  Parent,     \* [Fibers -> Fibers \cup {NoFiber}]   作用域树
  Requires,   \* [Fibers -> SUBSET Fibers]           注入的依赖
  Hosts,      \* [Fibers -> SUBSET Points]           声明的拓展点
  Contrib,    \* [Fibers -> SUBSET (Points \X Keys)] 放的贡献
  KeyFrom,    \* [Points -> Points \cup {NoPoint}]   键取自另一个拓展点（递归规则二）
  Rank,       \* [Fibers -> Nat]                     贡献自带的次序，不是到达次序
  Policy,     \* "conflict" | "rank" | "arrival"     同一个键多于一项时怎样答
  Rule,       \* "set" | "first-wins" | "release-by-key"  登记表怎样存
  MaxGen

VARIABLES
  gen,        \* [Fibers -> 0..MaxGen]  这个 fiber 已经起过几代
  clock,      \* 到达序号
  live,       \* 已装上的实例 <<fiber, 代, 到达序号>>
  reg,        \* 登记表：[inst, p, k] 的集合
  want,       \* 要了、还没撤的 fiber
  last,       \* 上一步动的是哪个 fiber
  probe,      \* 开局随意挑的一个 want 取值
  probeSet,   \* 是否已经到达过 want = probe
  probeView   \* 第一次到达 want = probe 时看到的答案

vars == <<gen, clock, live, reg, want, last, probe, probeSet, probeView>>

None     == "none"
Conflict == "conflict"

LiveFibers == {i[1] : i \in live}

Down(S) == S \cup {g \in Fibers : Parent[g] \in S \/ Requires[g] \cap S # {}}
RECURSIVE Close(_)
Close(S) == IF Down(S) = S THEN S ELSE Close(Down(S))
\* 卸下 f 时一起下去的：它作用域里的，和注入了它们的
Fall(f) == Close({f})

Entries(i) == {[inst |-> i, p |-> c[1], k |-> c[2]] : c \in Contrib[i[1]]}

At(r, p, k) == {e \in r : e.p = p /\ e.k = k}

ByRank(s)    == CHOOSE e \in s : \A o \in s : Rank[e.inst[1]] <= Rank[o.inst[1]]
ByArrival(s) == CHOOSE e \in s : \A o \in s : e.inst[3] <= o.inst[3]

Winner(r, p, k) ==
  LET s == At(r, p, k) IN
  IF s = {} THEN None
  ELSE IF Cardinality(s) = 1 THEN (CHOOSE e \in s : TRUE).inst[1]
  ELSE IF Policy = "rank" THEN ByRank(s).inst[1]
  ELSE IF Policy = "arrival" THEN ByArrival(s).inst[1]
  ELSE Conflict

Declared(lv, p) == \E f \in lv : p \in Hosts[f]

\* 拓展点对一个键给出的答案。宿主不在：没有。键取自另一个拓展点而那边没有这个键：没有。
RECURSIVE Eff(_, _, _, _)
Eff(r, lv, p, k) ==
  IF ~Declared(lv, p) THEN None
  ELSE IF KeyFrom[p] # NoPoint /\ Eff(r, lv, KeyFrom[p], k) \in {None, Conflict} THEN None
  ELSE Winner(r, p, k)

View == [pk \in Points \X Keys |-> Eff(reg, LiveFibers, pk[1], pk[2])]

TypeOK ==
  /\ gen \in [Fibers -> 0..MaxGen]
  /\ want \subseteq Fibers
  /\ probe \subseteq Fibers
  /\ \A i \in live : i[1] \in Fibers /\ i[2] \in 1..MaxGen

Init ==
  /\ gen = [f \in Fibers |-> 0]
  /\ clock = 0
  /\ live = {}
  /\ reg = {}
  /\ want = {}
  /\ last = NoFiber
  /\ probe \in SUBSET Fibers
  /\ probeSet = (probe = {})
  /\ probeView = [pk \in Points \X Keys |-> None]

CanLoad(f) ==
  /\ f \notin LiveFibers
  /\ gen[f] < MaxGen
  /\ Parent[f] = NoFiber \/ Parent[f] \in LiveFibers
  /\ Requires[f] \subseteq LiveFibers

Load(f) ==
  /\ CanLoad(f)
  /\ LET tick  == IF Policy = "arrival" THEN clock + 1 ELSE 0
         i     == <<f, gen[f] + 1, tick>>
         clash == \E c \in Contrib[f] : At(reg, c[1], c[2]) # {}
     IN /\ gen' = [gen EXCEPT ![f] = @ + 1]
        /\ clock' = tick
        /\ want' = want \cup {f}
        /\ IF Rule = "first-wins" /\ clash
             THEN live' = live /\ reg' = reg            \* 登记被拒，这个 fiber 起不来
             ELSE live' = live \cup {i} /\ reg' = reg \cup Entries(i)
  /\ last' = f

Unload(f) ==
  /\ f \in LiveFibers
  /\ LET gone == {i \in live : i[1] \in Fall(f)} IN
     /\ live' = live \ gone
     /\ reg' = IF Rule = "release-by-key"
                 THEN {e \in reg : ~\E i \in gone : <<e.p, e.k>> \in Contrib[i[1]]}
                 ELSE {e \in reg : e.inst \notin gone}
     /\ want' = want \ Fall(f)
  /\ UNCHANGED <<gen, clock>>
  /\ last' = f

\* 旧一代迟到的撤回：那一代早就不在了，撤回的调用现在才到
LateRelease(f, g) ==
  /\ g \in 1..gen[f]
  /\ ~\E i \in live : i[1] = f /\ i[2] = g
  /\ reg' = IF Rule = "release-by-key"
              THEN {e \in reg : <<e.p, e.k>> \notin Contrib[f]}
              ELSE {e \in reg : ~(e.inst[1] = f /\ e.inst[2] = g)}
  /\ UNCHANGED <<gen, clock, live, want>>
  /\ last' = f

\* 局部：一步只改变它碰到的那些键的答案
RECURSIVE Up(_)
Up(q) == {q} \cup (IF KeyFrom[q] = NoPoint THEN {} ELSE Up(KeyFrom[q]))
Base(f) ==
  UNION {Contrib[g] : g \in Fall(f)}
    \cup {pk \in Points \X Keys : \E g \in Fall(f) : pk[1] \in Hosts[g]}
Touched(f) == {qk \in Points \X Keys : \E p \in Up(qk[1]) : <<p, qk[2]>> \in Base(f)}

Local ==
  \A pk \in Points \X Keys :
    pk \notin Touched(last') => View'[pk] = View[pk]

Step ==
  \/ \E f \in Fibers : Load(f) \/ Unload(f)
  \/ \E f \in Fibers, g \in 1..MaxGen : LateRelease(f, g)

Next ==
  /\ Step
  /\ probe' = probe
  /\ probeSet' = (probeSet \/ want' = probe)
  /\ probeView' = IF want' = probe /\ ~probeSet THEN View' ELSE probeView
  /\ Assert(Local, <<"locality broken by", last'>>)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* 性质 *)

\* 次序无关：want 相同，答案相同。不预设用哪一种 Policy。
Functional == (want = probe /\ probeSet) => View = probeView

\* 次序无关的强形式：答案能只从 want 算出来，不看任何历史。跨行为成立。
IdealReg(w) == UNION {{[inst |-> <<f, 0, 0>>, p |-> c[1], k |-> c[2]] : c \in Contrib[f]} : f \in w}
Canonical == View = [pk \in Points \X Keys |-> Eff(IdealReg(want), want, pk[1], pk[2])]

\* 可逆：登记表恰好是现有实例的贡献，卸下不留痕，也不多删
Exact == reg = UNION {Entries(i) : i \in live}

\* 要了的都装上了（没有因为先后被拒的）
Granted == LiveFibers = want

\* 作用域与依赖闭合
Closed ==
  \A i \in live :
    /\ Parent[i[1]] = NoFiber \/ Parent[i[1]] \in LiveFibers
    /\ Requires[i[1]] \subseteq LiveFibers

OneInstance == \A i, j \in live : i[1] = j[1] => i = j


\* 见证用：这些「不变式」预期被打破，用来证明状态可达
NotAllLive == LiveFibers # Fibers
=============================================================================
