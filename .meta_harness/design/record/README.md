# 已发生的事

这里保存候选、接受与运行结果——三类都在陈述**过去发生过什么**。

失效事件：没有。已经发生的事不会失效，只会被后来的事取代。
因此这里只追加，不追溯改写；一项结论被推翻时写新的并标明取代范围，
不回去修改旧记录使它看起来一直是对的。

## 三类的权威各不相同

合并成一个顶层，是因为它们共享同一条纪律，且都是**跨主体**的：
一份决定常常同时影响三四个能力，一次运行常常同时覆盖多个契约。
把它们挂到某个能力或对象名下，放哪个都错。

但权威语义必须保持可辨，因此路径仍然区分：

| 子目录 | 陈述什么 | 不能据此声称 |
|---|---|---|
| [proposals/](proposals/README.md) | 候选设计、取舍与评审处置 | 已被接受，或可供消费者采用 |
| [decisions/](decisions/README.md) | 谁在什么权限范围接受了哪个精确修订 | 已实现、已验证或消费者已升级 |
| [evidence/](evidence/README.md) | 实际跑过什么、在什么输入范围内得到什么结果 | 无条件成立，或未覆盖情形也成立 |

提案组织候选，决定记录已接受选择，证据保存真实观察；
各自引用其依据，不互相冒充或复制同义定义。文件存在、reviewer 无意见、
或换一个目录，都不提升状态。

> **观察不在这里。**核实事实、版本化读数、推断与局限归**与 `design/` 平级的顶层
> [`research/`](../../research/README.md)**；跨多次设计被反复依赖、且给得出 probe 的机制语义
> 另立 [basis 条目](../basis/README.md)。**本目录不设第二个 research 家。**

## 准入

进入前必须能回答：这件事**是否真的发生过**，谁在什么权限范围内做的，
以及后续哪个设计判断会继续消费它。

- 计划、派发、扫描清单、进度和任务日志始终留在本次工作区的 `tmp/`，不是已发生的事。
- 不足三个实质候选时继续[研究](../../research/README.md)或任务探索，不用改名、参数变化或空选项凑数建 proposal。
- 没有实际接受就留在 proposal；评审意见和作者推荐不能升级状态。
- 没有实际运行就没有 evidence；预期结果、样例输出和计划中的验证都不进这里。

每份决定至少关联一份提案或一份[研究](../../research/README.md)。推翻已有决定需要可复现、可验证、可因果解释的强理由，
并以新决定明确取代范围；在有效需求前提和适用范围内，没有新观测时有效决定是三者的最终权威。

## 主题组织

`proposals/` 与 `decisions/` 按 topic 组织，各自有本地 `.templates/topic/`；
`evidence/` 按运行组织，见其入口。命名、裁剪与跨目录引用遵循[信息包约定](../README.md#主题是信息包)。

## 什么时候会有第一条内容

**三类各有一个明确的触发时刻，都在架构与规格设计环节：**

| 子目录 | 被什么触发 |
|---|---|
| `decisions/` | **有权者实际接受了一个精确对象**——契约从 `candidate` 变成 `accepted` 是其中一种（[catalog 的 `accepted` 条目必须链接一份实际的 decision 文件](../registry/README.md)）；产品形态、采用方向这类接受同样触发它 |
| `evidence/` | **第一次以 `--formal run` 真正执行形式任务**——[登记在 registry 的那几个任务](../registry/README.md)跑出来的配置、输入快照与原始结果 |
| `proposals/` | 第一次对账（`harness-design-handbook` skill 的步骤 D）走到回询：两种表述要分别往下推，候选必须并存可比 |

**在那之前它们是空的，这是诚实的空**——没有实际发生的事就不追加。

**2026-09-22，其中两个触发了**：
[`evidence/2026-09-22-formal-tenant-domain/`](evidence/2026-09-22-formal-tenant-domain/README.md)
是四个已登记形式任务加两项未登记检查的首次成套执行；
[`proposals/identity-values-v1/`](proposals/identity-values-v1/README.md)
收了三份独立起草的候选与主线的合并裁定。
**`decisions/` 同日收了两条**——[D-022 CLI-TUI 交付形态](decisions/cli-tui-delivery-form/README.md)与
[D-019 定向 fork pi-ai](decisions/model-provider-pi-ai-fork/README.md)，一条是产品形态、一条是采用方向；
**两条都不接受任何契约**：[catalog 里五份契约仍全是 `candidate`](../registry/README.md)，一份都没有被接受。


返回[设计链入口](../README.md)。
