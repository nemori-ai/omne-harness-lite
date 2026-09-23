/*
 * Readable.als —— 「此刻模型可读」的派生规则，与压缩名单合法性的结构约束。
 *
 * 对应契约条款（均指 data.messages v1）：
 *   S-28  此刻模型可读是算出来的：path(b) 上每一块都标着给模型，
 *         且前缀里没有压缩记录点过 path(b) 的任何一块
 *   S-29  合法名单的判定 ① ② ④ ⑤（③ 被建模方式吸收；⑥ 未建模——见 README）
 *   S-30  悬着的占位的第 1 类：转后台的工具消息，前缀里还没有它的后台收场提醒
 *   S-32  ② 一个调用至多一条工具消息；④ 后台收场提醒排在转后台占位之后，一个调用至多一条
 *
 * 块的嵌套与合取取用的权威不在本契约，坐标如下——本文件按那两条建模：
 *   omne-harness-lite-design-2026-09-15 · data.content-blocks · v1 · S-3（块在一条消息内唯一，含嵌套；
 *     (messageId, blockId) 指认一块）
 *   omne-harness-lite-design-2026-09-15 · data.content-blocks · v1 · S-5（嵌在别的块里的块，
 *     进某一侧当且仅当它的容器进那一侧、且它自己那一位为真）
 *
 * 本模型不表达：块的形状与拒绝值（归 Schema）、名单点了不存在的块（③：本模型的 names 只能取存在的块）、
 * 输入区间的上界（⑥：「上一次模型请求落在日志哪一处」不在消息里，G-2）、没答完的卡片的占位（S-30 第 2 类，G-5）。
 *
 * 用法：Alloy Analyzer 逐条 check / run 本文件末尾的命令。
 * 本文件只定义模型与命令，不在此记录执行结果——结果归 ../../verification.md。
 */

open util/ordering[Msg]

// ---------------------------------------------------------------------------
// 一份会话日志：消息按日志先后全序排列（契约第二节：「之前」只按日志先后）
// ---------------------------------------------------------------------------

sig Call {}

abstract sig Msg {}

sig SystemMsg extends Msg {}

// 工具消息：一次调用恰一条（S-11）；call 是它的 callId
sig ToolMsg extends Msg { call : one Call }

// 工具结果块 outcome = backgrounded 的那些工具消息——转后台的占位（S-11）
sig BackgroundedTool in ToolMsg {}

// 后台执行的两种收场提醒合在一起（S-19）：ends 是它说的那次调用
sig EndReminder extends Msg { ends : one Call }

// 压缩记录与它的名单（S-27）
sig Compaction extends Msg { names : set Block }

// 其余几种消息：对本模型要检查的性质没有区别
sig OtherMsg extends Msg {}

// 块：属于一条消息；至多一个容器（工具结果块的 blocks、派生表示的 blocks 里的块有容器）
sig Block {
    owner     : one Msg,
    container : lone Block
}

// visibility.toModel = true 的那些块
sig ModelVisible in Block {}

// 块树：容器与块同属一条消息；容器链不成环（data.content-blocks v1 S-3）
fact BlockTrees {
    all b : Block | some b.container implies b.container.owner = b.owner
    no b : Block | b in b.^container
}

// 会话日志层的配对与唯一（S-32 ② ④）
fact LogPairing {
    all disj t1, t2 : ToolMsg | t1.call != t2.call
    all r : EndReminder | some t : BackgroundedTool | t.call = r.ends and lt[t, r]
    all disj r1, r2 : EndReminder | r1.ends != r2.ends
}

// ---------------------------------------------------------------------------
// 派生
// ---------------------------------------------------------------------------

// 到 p 为止的日志前缀（含 p）
fun upTo[p : Msg] : set Msg { p + prevs[p] }

// S-28 的 path(b)：b 自己，加上往外直到顶层的每一个容器
fun path[b : Block] : set Block { b.*container }

// S-30 第 1 类：在前缀 P 处悬着的占位——那条工具消息里的每一块，含嵌套层
fun outstandingIn[P : set Msg] : set Block {
    { b : Block |
        some t : BackgroundedTool & P |
            (b.owner = t) and (no r : EndReminder & P | r.ends = t.call) }
}

// S-29：一条压缩记录 c 的名单，对它之前的前缀合法
pred legal[c : Compaction] {
    c.names.owner in prevs[c]                    // ① 不点自己；② 只点之前的消息
    no c.names.owner & SystemMsg                 // ④ 不点系统提示词
    no c.names & outstandingIn[prevs[c]]         // ⑤ 不点在它之前的前缀里悬着的占位
}

// 进得了日志的名单都合法（S-29 最后一条：不合法的名单不进日志）
fact AllListsLegal { all c : Compaction | legal[c] }

// S-28：块 b 在「到 p 为止的日志」里模型可读
pred readable[b : Block, p : Msg] {
    b.owner in upTo[p]
    path[b] in ModelVisible
    no c : Compaction & upTo[p] | some c.names & path[b]
}

// ---------------------------------------------------------------------------
// 待核对的断言
// ---------------------------------------------------------------------------

/* A1（S-29 ① ②）：点名只能向前、不点自己——
   一块刚进日志、path 全标着给模型，它在那一刻就可读。
   它不是 legal 的复述：是 legal 与 readable 两个定义合起来的推论。
   把 ① 放宽成 `c.names.owner in upTo[c]`（允许点自己），或把 ② 放宽成 `c.names.owner in Msg`（允许向前），
   本断言都必须给出反例——一块一出生就被点掉。预期：找不到反例。 */
assert NewBlocksBornReadable {
    all b : Block | path[b] in ModelVisible implies readable[b, b.owner]
}

/* A2（S-29 ⑤ + S-30）：悬着的占位不可点——
   在任何前缀 p 处悬着的那条转后台工具消息，它的每一块只要 path 全标着给模型，在 p 处就可读。

   **本断言不用 outstandingIn，而是把「悬着」独立写一遍**：
   否则把 outstandingIn 写错（按整份日志判悬着、只算顶层块），断言会跟着一起错而查不出来。
   两个变异都必须给出反例：
     - outstandingIn 里的 `EndReminder & P` 改成 `EndReminder`（按整份日志判：后来才结束的，被当成已结束）；
     - outstandingIn 里加上 `no b.container`（只算顶层块：嵌着的块被点掉）。
   预期：找不到反例。 */
assert OutstandingPlaceholderStaysReadable {
    all p : Msg, t : BackgroundedTool & upTo[p] |
        (no r : EndReminder & upTo[p] | r.ends = t.call) implies
            (all b : owner.t | path[b] in ModelVisible implies readable[b, p])
}

/* A3（S-28）：可读性单调不回退——一块在某个前缀里不可读，在更长的任何前缀里都不可读。
   预期：找不到反例。 */
assert ReadabilityMonotone {
    all b : Block, p, q : Msg |
        (lte[p, q] and b.owner in upTo[p] and not readable[b, p]) implies not readable[b, q]
}

/* A4（S-28 + data.content-blocks v1 S-5）：嵌套块可读，它的每一个容器都可读——
   标注与名单都只会往「不可读」那边收，不会被容器放宽。
   把 path 改成只含 b 自己（`b` 而不是 `b.*container`），本断言必须给出反例。预期：找不到反例。 */
assert NestedReadableImpliesContainersReadable {
    all b : Block, p : Msg | readable[b, p] implies (all x : b.^container | readable[x, p])
}

// ---------------------------------------------------------------------------
// 一致性核对：模型能产生预期的合法实例，
// 而不是靠约束互相矛盾让上面的断言空泛成立。
// ---------------------------------------------------------------------------

// R1：一个带嵌套块的转后台占位；它悬着时有一条压缩记录点了别处的块；
//     后台收场提醒到了之后，另一条压缩记录点了占位里嵌着的那一块——两条名单都合法。
//     这个实例同时是 A2 前件成立（在 c1 处悬着）与不成立（在 c2 处已结束）的见证。
pred placeholderNamedOnlyAfterItEnded {
    some t : BackgroundedTool, r : EndReminder, disj c1, c2 : Compaction, b, x : Block {
        r.ends = t.call
        lt[t, c1] and lt[c1, r] and lt[r, c2]
        b.owner = t and some b.container
        b in c2.names
        x in c1.names and x.owner != t
    }
}

// R2：只点一个嵌套块，它的容器照样可读（S-27：可以只点里面的某一块）。
pred aNestedBlockSilencedAlone {
    some c : Compaction, b : Block {
        some b.container
        b in c.names
        readable[b.container, c]
    }
}

run placeholderNamedOnlyAfterItEnded for 6
run aNestedBlockSilencedAlone for 5

check NewBlocksBornReadable for 6
check OutstandingPlaceholderStaysReadable for 6
check ReadabilityMonotone for 6
check NestedReadableImpliesContainersReadable for 6
