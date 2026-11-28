------------------------------ MODULE LoopExec ------------------------------
(* 一次 execution：决定者是一段固定的脚本，每次叫醒从头算，只读执行记录（R1）。
     1 model()                         Agent 的调用：先过「调用之前」与准入
     2 extend(P)                       环的点：一次经过，答复是 go 或 veto
     3 tool(verdict2 = go ? main : alt)
     4 finish()                        收尾也是调用：「收尾之前」可以否决
     5 model()                         只在 4 被否决时
     6 finish()
   执行记录是只增的序列（R3）。活体随时可以丢；租户随时可以启用、停用拓展件 x。
   Bad* 开关各破坏一条规则，用来证明对应的性质真的会红。 *)
EXTENDS Naturals, Sequences

CONSTANTS MaxCrash, BadEmptyUnrecorded, BadFinishUnrecorded, BadBypass, BadDirectEffect

VARIABLES rec, mem, tenant, effects, capEffects, cancelled, crashes, ended

vars == <<rec, mem, tenant, effects, capEffects, cancelled, crashes, ended>>

Positions == 1..6
EffectPositions == {1, 3, 5}

E(t, p, v, a) == [t |-> t, p |-> p, v |-> v, a |-> a]

Has(s, t, p) == \E i \in 1..Len(s) : s[i].t = t /\ s[i].p = p
ValOf(s, t, p) == LET i == CHOOSE j \in 1..Len(s) : s[j].t = t /\ s[j].p = p IN s[i].v

\* 决定者看到的：执行记录，加上活体内存里还没落盘的。只有坏的实现会把决定依据留在内存里。
Known == rec \o mem

Answered(s, p) ==
  \/ Has(s, "reply", p) \/ Has(s, "blocked", p) \/ Has(s, "verdict", p) \/ Has(s, "terminal", p)

Started(s, p) == Has(s, "issued", p) \/ Has(s, "chain", p)

Arg3(s) == IF Has(s, "verdict", 2) /\ ValOf(s, "verdict", 2) = "go" THEN "main" ELSE "alt"

\* 决定者：从头算出下一件要做的事。
Want(s) ==
  IF ~Answered(s, 1) THEN IF Started(s, 1) THEN [k |-> "wait"] ELSE [k |-> "call", p |-> 1, v |-> "model"]
  ELSE IF ~Answered(s, 2) THEN IF Started(s, 2) THEN [k |-> "wait"] ELSE [k |-> "pass", p |-> 2]
  ELSE IF ~Answered(s, 3) THEN IF Started(s, 3) THEN [k |-> "wait"] ELSE [k |-> "call", p |-> 3, v |-> Arg3(s)]
  ELSE IF ~Answered(s, 4) THEN [k |-> "finish", p |-> 4]
  ELSE IF Has(s, "terminal", 4) THEN [k |-> "done"]
  ELSE IF ~Answered(s, 5) THEN IF Started(s, 5) THEN [k |-> "wait"] ELSE [k |-> "call", p |-> 5, v |-> "model"]
  ELSE IF ~Answered(s, 6) THEN [k |-> "finish", p |-> 6]
  ELSE [k |-> "done"]

\* 落盘时把活体里待落盘的一并写下：没有成员的经过的「原样通过」搭在下一次提交里。
\* 坏的实现让某一类永远只在内存里。
Persistable(e) == \/ (e.t = "verdict" /\ ~BadEmptyUnrecorded)
                  \/ (e.t = "reply" /\ ~BadFinishUnrecorded)
Volatile(e) == ~Persistable(e)
Flush   == SelectSeq(mem, Persistable)
KeepMem == SelectSeq(mem, Volatile)

Init ==
  /\ rec = <<>> /\ mem = <<>> /\ tenant \in {{}, {"x"}}
  /\ effects = [p \in EffectPositions |-> 0] /\ capEffects = 0
  /\ cancelled = FALSE /\ crashes = 0 /\ ended = FALSE

\* 发一个模型或工具调用：Agent 先走「调用之前」，再按生效参数问准入。
Issue ==
  LET w == Want(Known) IN
  /\ ~ended /\ ~cancelled /\ w.k = "call"
  /\ \/ /\ BadBypass /\ w.p = 3 /\ w.v = "main"      \* 坏：环的点说了 go，就当放行
        /\ rec' = rec \o Flush \o <<E("issued", w.p, w.v, FALSE)>>
        /\ effects' = [effects EXCEPT ![w.p] = @ + 1]
     \/ /\ rec' = rec \o Flush \o <<E("issued", w.p, w.v, TRUE)>>
        /\ effects' = [effects EXCEPT ![w.p] = @ + 1]
     \/ /\ rec' = rec \o Flush \o <<E("blocked", w.p, w.v, FALSE)>>   \* 被拦下：确定没发出
        /\ UNCHANGED effects
  /\ mem' = KeepMem
  /\ UNCHANGED <<tenant, capEffects, cancelled, crashes, ended>>

Reply(p) ==
  /\ Has(rec, "issued", p) /\ ~Has(rec, "reply", p)
  /\ rec' = Append(rec, E("reply", p, "r", FALSE))
  /\ UNCHANGED <<mem, tenant, effects, capEffects, cancelled, crashes, ended>>

\* 开始一次经过：此刻读一次租户启用的成员。没有成员时答「原样通过」，等下一次提交搭着写下。
StartPass ==
  /\ ~ended /\ ~cancelled /\ Want(Known).k = "pass"
  /\ IF tenant = {}
       THEN /\ mem' = Append(mem, E("verdict", 2, "go", FALSE)) /\ UNCHANGED rec
       ELSE /\ rec' = Append(rec, E("chain", 2, "x", FALSE)) /\ UNCHANGED mem
  /\ UNCHANGED <<tenant, effects, capEffects, cancelled, crashes, ended>>

\* 成员经注入能力做一件事：先记后做（R2）。直接动外界的成员不记账（BadDirectEffect）。
MemberEffect ==
  /\ Has(rec, "chain", 2) /\ ~Has(rec, "verdict", 2) /\ ~Has(Known, "cap", 2)
  /\ IF BadDirectEffect
       THEN /\ mem' = Append(mem, E("cap", 2, "", FALSE)) /\ UNCHANGED rec
       ELSE /\ rec' = Append(rec, E("cap", 2, "", FALSE)) /\ UNCHANGED mem
  /\ capEffects' = capEffects + 1
  /\ UNCHANGED <<tenant, effects, cancelled, crashes, ended>>

MemberConclude ==
  /\ Has(rec, "chain", 2) /\ ~Has(rec, "verdict", 2) /\ Has(Known, "cap", 2)
  /\ \E v \in {"go", "veto"} : rec' = Append(rec, E("verdict", 2, v, FALSE))
  /\ UNCHANGED <<mem, tenant, effects, capEffects, cancelled, crashes, ended>>

\* 收尾：走「收尾之前」。第一次收尾时拓展件在场就可能否决；否决是这次收尾调用的答复。
Finish ==
  LET w == Want(Known) IN
  /\ ~ended /\ ~cancelled /\ w.k = "finish"
  /\ \/ /\ rec' = rec \o Flush \o <<E("terminal", w.p, "ok", FALSE)>>
        /\ ended' = TRUE /\ mem' = KeepMem
     \/ /\ w.p = 4 /\ tenant = {"x"}
        /\ IF BadFinishUnrecorded
             THEN /\ mem' = Append(mem, E("reply", 4, "veto", FALSE)) /\ UNCHANGED rec
             ELSE /\ rec' = rec \o Flush \o <<E("reply", 4, "veto", FALSE)>> /\ mem' = KeepMem
        /\ UNCHANGED ended
  /\ UNCHANGED <<tenant, effects, capEffects, cancelled, crashes>>

Crash ==
  /\ crashes < MaxCrash
  /\ mem' = <<>> /\ crashes' = crashes + 1
  /\ UNCHANGED <<rec, tenant, effects, capEffects, cancelled, ended>>

Toggle ==
  /\ tenant' = IF tenant = {} THEN {"x"} ELSE {}
  /\ UNCHANGED <<rec, mem, effects, capEffects, cancelled, crashes, ended>>

Cancel ==
  /\ ~cancelled /\ ~ended
  /\ cancelled' = TRUE
  /\ UNCHANGED <<rec, mem, tenant, effects, capEffects, crashes, ended>>

Engine == Issue \/ StartPass \/ MemberEffect \/ MemberConclude \/ Finish \/ \E p \in EffectPositions : Reply(p)

Next == Engine \/ Crash \/ Toggle \/ Cancel

Spec == Init /\ [][Next]_vars /\ WF_vars(Engine)

-----------------------------------------------------------------------
\* R1：记录里每个由决定者发起的调用，都能由它之前的记录算出来；决定依据都在记录里。
Justified ==
  /\ \A i \in 1..Len(rec) :
       (rec[i].t \in {"issued", "blocked"} /\ rec[i].p = 3) =>
         \E j \in 1..(i - 1) : rec[j].t = "verdict" /\ rec[j].p = 2
                               /\ rec[i].v = (IF rec[j].v = "go" THEN "main" ELSE "alt")
  /\ \A i \in 1..Len(rec) :
       (rec[i].t \in {"issued", "blocked"} /\ rec[i].p = 5) =>
         \E j \in 1..(i - 1) : rec[j].t = "reply" /\ rec[j].p = 4 /\ rec[j].v = "veto"
  /\ \A i, j \in 1..Len(rec) :
       (rec[i].t = "verdict" /\ rec[j].t = "verdict" /\ rec[i].p = rec[j].p) => i = j

\* 每个效果至多发生一次（R2）；成员的效果也一样。
NoDup == (\A p \in EffectPositions : effects[p] <= 1) /\ capEffects <= 1

\* 不绕过：每个发出去的效果调用都过了「调用之前」与准入。
NoBypass == \A i \in 1..Len(rec) : rec[i].t = "issued" => rec[i].a

NeverLoopVeto   == ~(\E i \in 1..Len(rec) : rec[i].t = "verdict" /\ rec[i].v = "veto")
NeverFinishVeto == ~Has(rec, "reply", 4)
NeverBlocked    == ~(\E i \in 1..Len(rec) : rec[i].t = "blocked")
NeverEnded      == ~ended
NeverRecognized == ~(Has(rec, "cap", 2) /\ crashes > 0 /\ Has(rec, "verdict", 2) /\ capEffects = 1)
=========================================================================
