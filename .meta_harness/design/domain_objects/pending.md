# 待裁

**像对象、但对象性还没有人裁过的东西。**缺定义的、两处正文说法相左的、悬空引用的。
每项都写清**谁来裁**与**闭合条件**——一项没有 owner 的待裁，六个月后就是一个没人记得问过的问题。

> **这里不裁决。**裁决权在各 topic 的 owner 与产品负责人手上；这里只保证这些问题不从视野里消失。
> 架构或规格设计要用到其中某一项之前，**先让它闭合，不要就地猜一个**。

格式见 [conventions](conventions.md#一项待裁长什么样)。第一节的各项在统一语言里有词条、形态标为「未定」，
同时登记在 [conflicts.md](../ubiquitous_language/conflicts.md#现有冲突)（两种读法的原文与出处在那里）；其余没有词条。

## 有词条，形态未定

**当前没有。**每个词条的[形态](../ubiquitous_language/conventions.md#形态这个词指的是哪一类东西)都已裁过。

## 没有词条

### 存储

- **现象**：工具定义可以指名声明「把附件放进哪个存储」，存储没配好则该工具整个不可用；被卸载的工具结果也「存着，没丢」。但全系统没有任何一处定义它——是对象、是一项设置、还是执行环境的一种设施，没人说过
- **牵涉**：[PF-006 §4 工具的产出](../product/PF-006-tools-and-skills/design.md#工具的产出)（rev 20）；[PF-006 §6.4](../product/PF-006-tools-and-skills/design.md#64-依赖声明与解析)（rev 20）；[PF-012 §5.10](../product/PF-012-agent-loop-and-run/design.md#510-卸载结果落成消息之前的那一关)（rev 15）
- **挂着谁**：[附件](objects.md#ul-attachment--附件)存在它里面，附件的宿主与留存因此都定不下来；被卸载的工具结果存在哪、留多久同样悬着
- **谁来裁**：PF-006 的 owner
- **闭合条件**：有一个 topic 定义了它，并立了词条，或明确说它不是一个产品概念

### 跨会话的那个对象

- **现象**：PF-007 说待办「活在一次会话里，不跨会话继承。跨会话的东西不装在这扇门后面」，并在边界一节登记为「尚无归属」。它曾被叫作「目标」，但设计链里没有它的定义
- **牵涉**：[PF-007 §6.9](../product/PF-007-meta-capabilities/design.md#69-todoitems通向自己手上的待办)（rev 19）；[PF-007 §八](../product/PF-007-meta-capabilities/design.md#八边界与依赖)（rev 19）
- **谁来裁**：产品负责人——它要不要做、归哪个 topic，都还没有人说过；已记入 PF-007 decisions「已知的来源问题」
- **闭合条件**：有 topic 认领它，或明确本版不做

### runtime context 的一块

- **现象**：PF-015 说 runtime context「是一块一块的，不是一个大袋子，每一块是一份数据」，每块有生产者与消费者、就地更新、要能恢复。词条 UL-runtime-context 指的是整批（形态为总称），真正可指认的单位「块」没有词条；而十四项里有的是实时算的、没有持久状态
- **牵涉**：[PF-015 §4 runtime context](../product/PF-015-session-lifecycle-and-ownership/design.md#runtime-context)（rev 13）；[PF-015 §5.6](../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 13）
- **谁来裁**：PF-015 的 owner
- **闭合条件**：正文写明「块」是不是一个要被标识的单位；是的话给它名字并立词条

### 一次派发

- **现象**：`spawn` / `delegate` 的一次派发有状态（在跑 → 完成 · 失败 · 被中断）、可被查询与撤回、至多带一份报告；它由一次工具执行承载，产生一个子会话，**`spawn` 那种还要在子会话日志里落下一条起始输入记录**。PF-007 的未决项里，产品侧倾向是「一次派发 ≈ 那个子会话里的一次运行」，但明确未定。词条 UL-agent-dispatch 讲的是派发这个过程
- **牵涉**：[PF-007 §6.8](../product/PF-007-meta-capabilities/design.md#68-agents通向别的-agent)（rev 19）；[PF-007 §9.2](../product/PF-007-meta-capabilities/design.md#92-报告之后派发者再发一条消息子拿什么回应)（rev 19）
- **挂着谁**：[派发报告](objects.md#ul-dispatch-report--派发报告)的宿主
- **谁来裁**：PF-007 的 owner，连带 PF-015（同一个子会话上能不能同时跑两次派发）
- **闭合条件**：正文写明一次派发是它自己，还是子会话里的那次运行，还是承载它的那次工具执行

### agent 之间的消息

- **现象**：PF-007 只定了「谁能给谁发」的两条规则；一条这样的消息靠什么标识、落在谁的会话里、留不留存，全未述。它是不是统一语言里那种「消息」的某一类，也没说
- **牵涉**：[PF-007 §6.8 先说谁能给谁发消息](../product/PF-007-meta-capabilities/design.md#先说谁能给谁发消息这是两条独立的规则)（rev 19）；[PF-014 §4 入站到达](../product/PF-014-inbound-intake-and-queueing/design.md#入站到达)（rev 8）
- **谁来裁**：PF-007 与 PF-014 的 owner
- **闭合条件**：正文写明它进收件方会话时走不走入站受理、落成哪一种消息

### 外部 harness 的 agent

- **现象**：能被派发指向、「能不能派给它」本身是一项要被授予的权限；但它在本系统里有没有一条登记记录，完全未述
- **牵涉**：[PF-007 §6.8 派给外部 harness 的 agent](../product/PF-007-meta-capabilities/design.md#派给外部-harness-的-agent)（rev 19）
- **谁来裁**：PF-007 的 owner
- **闭合条件**：正文写明它靠什么被指到、由谁登记与撤销

### 使用成本明细

- **现象**：PF-001 要求「一次调用花掉的成本必须能算到发起它的那个租户头上，并能逐条列出来」，同时明说成本怎么算、明细怎么归集与呈现「目前没有对应的产品设计」
- **牵涉**：[PF-001 §6.4](../product/PF-001-identity-scope-and-agent-constraints/design.md#64-隔离)（rev 22）
- **谁来裁**：产品负责人——「观测与计量」这一块还没有 topic
- **闭合条件**：有 topic 认领计量，并说明一条明细是什么

### 压缩策略

- **现象**：PF-015 把「当前使用的 ContextCompactionSettings」列为一项 meta runtime context，没有指明它定义在哪；它是一份独立的设置对象，还是某个对象上的一项值，无从判断
- **牵涉**：[PF-015 §5.6](../product/PF-015-session-lifecycle-and-ownership/design.md#56-十四项-meta-runtime-context)（rev 13）
- **谁来裁**：PF-010 与 PF-015 的 owner
- **闭合条件**：PF-010 认领它并说明它挂在哪

### 通知发送与投递结果

- **现象**：PF-021 已确定一次发送请求及其结果是用户可查询的单位，技术重试不成为多份独立用户通知，业务历史保留；通知、发送尝试与投递子记录如何分解及标识尚未定义
- **牵涉**：[PF-021 §6.5 通知发送与租户送达](../product/PF-021-schedule-and-calendar/design.md#65-通知发送与租户送达)（rev 8）；[技术设计交接](../product/PF-021-schedule-and-calendar/design.md#十技术设计交接事项)（rev 8）
- **谁来裁**：系统架构与规格，按 PF-021 已定查询单位、租户边界和送达判据决定记录分解及身份；不得以技术重试改变通知条数或业务历史范围
- **闭合条件**：明确记录关系、身份和生命周期，按所判形态补统一语言与对象条目，或说明投影到哪个既有对象；技术问题不再等待一项产品记录建模政策
