------------------------------ MODULE Assembly ------------------------------
(***************************************************************************)
(* capability.stream-assembly v1 的行为模型：一条到达流的装配状态。        *)
(*                                                                         *)
(* 本能力的五个操作都是作用于调用方持有的一个状态值的纯计算；本模型把那个  *)
(* 状态值写成「已接受的事件序列」，把 start、accept、closeOut、abandon 写  *)
(* 成对它的四种动作（snapshot 只读，不是动作）。被拒的事件不产生新状态。   *)
(*                                                                         *)
(* 装配结果由 Assemble 按事件逐个折叠得出——这就是被检查的到达装配这一步。 *)
(* 「一次性到达」由 OneShot 按块声明式地构造：每块开一次、填一次（填的是   *)
(* 它全部填的归约）、按原样封口或不封口，记账与收尾照旧。SplitInvariance    *)
(* 断言同一个折叠吃这两种序列，closeOut 交出的块、账、结局相等；           *)
(* OneShotAccepted 断言一次性形式本身逐个过得了 accept 的守卫（S-27 前一半）。*)
(*                                                                         *)
(* 条款映射、抽象与省略见同目录 README.md。                                *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
    Indices,     \* 块索引：非负整数的有限集
    Frags,       \* 片段符号（内容被抽象成符号序列）
    MaxEvents,   \* 一个状态值最多接受几个事件（有界）
    Mutation     \* "none"；有效性核对用 "order_by_close"、"replace_as_append" 或 "oneshot_close_first"

ASSUME Indices \subseteq Nat
ASSUME MaxEvents \in Nat
ASSUME Mutation \in {"none", "order_by_close", "replace_as_append", "oneshot_close_first"}

NoIdx == -1

\* grow：文本、思考、语音那样能一点点长的；call：工具调用；whole：图、文件、工具结果
Kinds       == {"grow", "call", "whole"}
Appendable  == {"grow", "call"}
Modes       == {"append", "replace"}
Reasons     == {"end", "max_tokens", "interrupted", "lost"}
TargetKinds == {"model", "tool"}

\* 事件一律用同一组字段，便于比较：e 种类、i 索引、k 块类型、m 填法、p 载荷、r 收尾原因
Ev(e, i, k, m, p, r) == [e |-> e, i |-> i, k |-> k, m |-> m, p |-> p, r |-> r]

\* 砍只取落在块 0 上的一种：它只记不改块，多取几种只放大状态空间
Alphabet ==
       {Ev("open", i, k, m, <<>>, "-") : i \in Indices, k \in Kinds, m \in Modes}
  \cup {Ev("fill", i, "-", "-", <<f>>, "-") : i \in Indices, f \in Frags}
  \cup {Ev("close", i, "-", "-", <<>>, "-") : i \in Indices}
  \cup {Ev("trim", 0, "-", "-", <<>>, "-")}
  \cup {Ev("account", NoIdx, "-", "-", <<>>, "-")}
  \cup {Ev("finish", NoIdx, "-", "-", <<>>, r) : r \in Reasons}

VARIABLES
    st,    \* "none"（尚未 start）| "live"（持有中）| "out"（已 closeOut 或 abandon）
    tk,    \* 这条流的目标种类："model" | "tool"（start 之前为 "-"）
    log,   \* 状态值：已接受的事件序列
    res    \* closeOut／abandon 交出的结果（之前为 "-"）

vars == <<st, tk, log, res>>

(***************************************************************************)
(* 从状态值读出的事实                                                      *)
(***************************************************************************)
Pos(l)         == 1..Len(l)
OpenedIn(l)    == {l[j].i : j \in {x \in Pos(l) : l[x].e = "open"}}
ClosedIn(l)    == {l[j].i : j \in {x \in Pos(l) : l[x].e = "close"}}
FinishedIn(l)  == \E j \in Pos(l) : l[j].e = "finish"
AccountsIn(l)  == Cardinality({j \in Pos(l) : l[j].e = "account"})
MaxOpened(l)   == IF OpenedIn(l) = {} THEN NoIdx
                  ELSE CHOOSE x \in OpenedIn(l) : \A y \in OpenedIn(l) : y <= x

(***************************************************************************)
(* accept 的守卫（契约 S-23 的判定失败，及 S-24 里要看目标种类的几条）。 *)
(* 守卫不成立即被拒：没有新状态。                                          *)
(***************************************************************************)
Valid(l, k, ev) ==
  /\ ~FinishedIn(l)                                           \* event_after_finish
  /\ CASE ev.e = "open" ->
            /\ ev.i \notin OpenedIn(l)                         \* index_reused
            /\ ev.i > MaxOpened(l)                             \* index_not_monotonic
            /\ (ev.m = "append" => ev.k \in Appendable)        \* fill_kind_not_appendable
       [] ev.e \in {"fill", "close"} ->
            ev.i \in OpenedIn(l) \ ClosedIn(l)                 \* block_not_open／block_already_closed
       [] ev.e = "trim" ->
            ev.i \in OpenedIn(l)                               \* block_not_open
       [] ev.e = "account" ->
            k = "model" /\ AccountsIn(l) = 0                   \* 工具侧没有账（malformed）；account_duplicate
       [] ev.e = "finish" ->
            k = "tool" => ev.r # "max_tokens"                  \* 工具侧没有 max_tokens（malformed）

(***************************************************************************)
(* 到达装配这一步：按事件逐个折叠                                          *)
(***************************************************************************)
S0 == [ord  |-> <<>>,
       md   |-> [i \in Indices |-> "-"],
       kd   |-> [i \in Indices |-> "-"],
       buf  |-> [i \in Indices |-> <<>>],
       nf   |-> [i \in Indices |-> 0],
       cl   |-> {},
       acct |-> FALSE,
       fin  |-> "-"]

Step(s, ev) ==
  CASE ev.e = "open" ->
         [s EXCEPT !.ord = IF Mutation = "order_by_close" THEN @ ELSE Append(@, ev.i),
                   !.md[ev.i] = ev.m,
                   !.kd[ev.i] = ev.k]
    [] ev.e = "fill" ->
         [s EXCEPT !.buf[ev.i] = IF s.md[ev.i] = "append" \/ Mutation = "replace_as_append"
                                 THEN @ \o ev.p
                                 ELSE ev.p,
                   !.nf[ev.i] = @ + 1]
    [] ev.e = "close" ->
         [s EXCEPT !.cl = @ \cup {ev.i},
                   !.ord = IF Mutation = "order_by_close" THEN Append(@, ev.i) ELSE @]
    [] ev.e = "account" -> [s EXCEPT !.acct = TRUE]
    [] ev.e = "finish"  -> [s EXCEPT !.fin = ev.r]
    [] OTHER            -> s                                    \* trim：只记，不改块

RECURSIVE FoldFrom(_, _, _)
FoldFrom(l, j, s) == IF j > Len(l) THEN s ELSE FoldFrom(l, j + 1, Step(s, l[j]))

Assemble(l) == FoldFrom(l, 1, S0)

\* closeOut 时一块怎么落（契约 S-9）：封了的原样；开着的调用块落成半截的；
\* 开着、填过的取归约；开着、没填过的不落
Settle(s, i) ==
  [i  |-> i,
   k  |-> s.kd[i],
   c  |-> s.buf[i],
   st |-> IF i \in s.cl THEN "sealed"
          ELSE IF s.kd[i] = "call" THEN "incomplete"
          ELSE IF s.nf[i] > 0 THEN "partial"
          ELSE "drop"]

Kept(b) == b.st # "drop"

Blocks(s) == SelectSeq([j \in 1..Len(s.ord) |-> Settle(s, s.ord[j])], Kept)

\* closeOut 交出的三样：块、账、结局。开口的位置属于到达的历史，不在相等关系里
Result(l, k) ==
  LET s == Assemble(l)
  IN [blocks  |-> Blocks(s),
      account |-> IF k = "tool" THEN "frames" ELSE IF s.acct THEN "reported" ELSE "unknown",
      ending  |-> s.fin]

(***************************************************************************)
(* 一次性到达：按块声明式地构造，不经 Assemble                             *)
(***************************************************************************)
IsOpenEv(ev)    == ev.e = "open"
IsAccountEv(ev) == ev.e = "account"
IsFinishEv(ev)  == ev.e = "finish"

OpensIn(l) == SelectSeq(l, IsOpenEv)

FillsOf(l, i) == SelectSeq(l, LAMBDA ev : ev.e = "fill" /\ ev.i = i)

RECURSIVE CatP(_)
CatP(fs) == IF fs = <<>> THEN <<>> ELSE Head(fs).p \o CatP(Tail(fs))

\* 一块全部填的归约：追加是依次相接，替换是最后一次（data.arrival-events/v1#S-19）
Reduced(l, o) ==
  LET fs == FillsOf(l, o.i)
  IN IF o.m = "append" THEN CatP(fs) ELSE fs[Len(fs)].p

\* 有效性核对 "oneshot_close_first"：把一块的封口排到它的填之前——契约 S-27 的构造次序
\* （开、填、封）一旦写错，一次性形式本身就过不了 accept，OneShotAccepted 必须因此失败
BlockSeg(l, o) ==
  LET fs == FillsOf(l, o.i)
      F  == IF fs = <<>> THEN <<>> ELSE <<Ev("fill", o.i, "-", "-", Reduced(l, o), "-")>>
      C  == IF o.i \in ClosedIn(l) THEN <<Ev("close", o.i, "-", "-", <<>>, "-")>> ELSE <<>>
  IN <<o>> \o (IF Mutation = "oneshot_close_first" THEN C \o F ELSE F \o C)

RECURSIVE Flatten(_)
Flatten(ss) == IF ss = <<>> THEN <<>> ELSE Head(ss) \o Flatten(Tail(ss))

OneShot(l) ==
     Flatten([j \in 1..Len(OpensIn(l)) |-> BlockSeg(l, OpensIn(l)[j])])
  \o SelectSeq(l, IsAccountEv)
  \o SelectSeq(l, IsFinishEv)

(***************************************************************************)
(* 行为                                                                    *)
(***************************************************************************)
Init == /\ st = "none"
        /\ tk = "-"
        /\ log = <<>>
        /\ res = "-"

Start(k) == /\ st = "none"
            /\ st' = "live"
            /\ tk' = k
            /\ UNCHANGED <<log, res>>

Accept(ev) == /\ st = "live"
              /\ Len(log) < MaxEvents
              /\ Valid(log, tk, ev)
              /\ log' = Append(log, ev)
              /\ UNCHANGED <<st, tk, res>>

\* closeOut：只对已收尾的状态成立（未收尾是 stream_not_finished）
CloseOut == /\ st = "live"
            /\ FinishedIn(log)
            /\ res' = Result(log, tk)
            /\ st' = "out"
            /\ UNCHANGED <<tk, log>>

\* abandon：只对未收尾的状态成立（已收尾再补收尾是 event_after_finish）；等于补一个 lost 再 closeOut
Abandon == /\ st = "live"
           /\ ~FinishedIn(log)
           /\ LET l2 == Append(log, Ev("finish", NoIdx, "-", "-", <<>>, "lost"))
              IN /\ log' = l2
                 /\ res' = Result(l2, tk)
           /\ st' = "out"
           /\ UNCHANGED tk

Next == \/ \E k \in TargetKinds : Start(k)
        \/ \E ev \in Alphabet : Accept(ev)
        \/ CloseOut
        \/ Abandon

Spec == Init /\ [][Next]_vars

(***************************************************************************)
(* 不变量                                                                  *)
(* FinishIsLast 到 ResultOnlyWithFinish 六条逐字复述 Valid、CloseOut、      *)
(* Abandon 的守卫，**按构造成立，不作证据**（证据是规范场景与 examples 第   *)
(* 5 节）；它们只说明模型没写错。作证据的是后三条：BlockOrderIsOpenOrder、  *)
(* SplitInvariance、OneShotAccepted，各有一个预期出反例的有效性核对配置。   *)
(***************************************************************************)
\* 收尾之后无事件；放弃不会给已收尾的流再补一个收尾
FinishIsLast == \A j \in Pos(log) : log[j].e = "finish" => j = Len(log)

\* 账至多一次
AccountAtMostOnce == AccountsIn(log) <= 1

\* 工具侧没有记账这一步
ToolHasNoAccount == tk = "tool" => AccountsIn(log) = 0

\* 一个索引终身只开一次，开块索引严格递增
OpenIndicesIncrease ==
  \A a, b \in Pos(log) :
    (a < b /\ log[a].e = "open" /\ log[b].e = "open") => log[a].i < log[b].i

\* 填与封口只落在已开、未封口的块上
FillsLandOnOpenBlocks ==
  \A j \in Pos(log) :
    log[j].e \in {"fill", "close"} =>
      /\ \E a \in 1..(j - 1) : log[a].e = "open" /\ log[a].i = log[j].i
      /\ ~\E c \in 1..(j - 1) : log[c].e = "close" /\ log[c].i = log[j].i

\* 交出结果的状态一定收过尾——没收到收尾的只能经放弃，放弃先补一个 lost
ResultOnlyWithFinish == st = "out" => FinishedIn(log)

\* 交出的块次序是开块次序（因此是索引序），与封口次序无关
BlockOrderIsOpenOrder ==
  st = "out" =>
    \A a, b \in 1..Len(res.blocks) : a < b => res.blocks[a].i < res.blocks[b].i

\* 一次装配 == 一次性到达：同一个折叠吃分次到达的序列与一次性到达的序列，交出的块、账、结局相等
SplitInvariance == st = "out" => res = Result(OneShot(log), tk)

\* 一次性形式本身逐个被接受（S-27 前一半）：它的每一个事件，都过得了接在它前面那一段之后的 accept 守卫
AcceptedSeq(l, k) == \A j \in 1..Len(l) : Valid(SubSeq(l, 1, j - 1), k, l[j])

OneShotAccepted == st = "out" => AcceptedSeq(OneShot(log), tk)

=============================================================================
