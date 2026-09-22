# 已发生的事：维护与导航

本文件说明**进到这个目录的人各自该走哪条路**，对所有人成立。
这一区拥有什么、三个子目录的权威为什么不同、各自的准入归 [README](README.md)
与三份子入口（[proposals](proposals/README.md)、[decisions](decisions/README.md)、[evidence](evidence/README.md)）。

这里没有专属 skill。**怎么比较候选、怎么写回询、怎么审一份候选、怎么把有限检查的边界写对**——
归 `harness-design-handbook` skill 的「设计选择」「交付与反向核对」两页；
**只有真要在这里落字的人才加载**，来查一条记录的人不加载。

一句话记住三个子目录：**proposal 是并排摆着的几条路，decision 是有权的人指了哪条，evidence 是真走过一遍留下的脚印。**
三者都只陈述过去，所以**只追加、不改写**：被推翻的写新的并标明取代范围，旧记录留在原地。

## 你来这里做什么

| 情形 | 怎么做 |
|---|---|
| 查**这条契约、这个绑定靠哪次运行撑着** | 别在这里翻目录。从 [registry/formal-tasks.json](../registry/README.md) 的任务 id 或 realization 节点 `bindings.yaml` 的 `evidence` 字段 join 过来，落到 `evidence/<run>/<task>/`；**读结论时带上那次 run README 写的边界** |
| 查**为什么选了这条路、当时还有哪几条** | `proposals/<topic>/alternatives.md`；作者推荐与评审意见都在那个包里，**都不是接受** |
| 查**谁在什么范围接受了哪个精确修订** | `decisions/<topic>/decision.md`。没有决定文件就是没接受，catalog 里的 candidate 也是这个意思 |
| 真跑了形式任务、符合性测试或集成观察，要留下结果 | 先加载 skill 的「交付与反向核对」，再按 [evidence 入口](evidence/README.md)建 run：**配置、输入快照、原始输出一件不少**，README 写边界。命名规矩归那份入口 |
| 有几条实质不同的路要并排比较，或对账走到回询、两种表述要分别往下推 | 先加载 skill 的「设计选择」，再从 [proposals 模板包](proposals/.templates/topic/README.md)建 topic。**不足三个实质候选就留在 research 或 `tmp/`** |
| 评审了一份候选（spec-reviewer、architecture-reviewer 或人），意见与作者处置要落地 | 进该候选所属 `proposals/<topic>/review.md`；没有 topic 的候选（例如直接在 `spec/` 起草的 candidate 契约）**先为它建 topic 再落评审**，评审不挂在契约版本目录里 |
| 有权者实际接受了一份修订 | 从 [decisions 模板包](decisions/.templates/topic/README.md)建 topic，然后去 [registry](../registry/README.md) 把状态翻过去并冻结资源——**两步都做，顺序是先决定后登记** |
| 想把派工记录、进度、扫描清单、事故复盘放进来 | 不进这里。那是本次工作区 `tmp/` 的东西；值得长期记住的判断回到它的拥有者 |
| 核实了一条上游事实、量了一个数、读了一遍源码 | 那是观察，归与 `design/` 平级的 `research/`，反复依赖且给得出 probe 的归 [basis](../basis/README.md)。**这里不设第二个 research 家** |

## 答案在哪一份

查**有哪几条路、各自代价** → `proposals/<topic>/alternatives.md`；
查**对候选的评审意见与处置** → `proposals/<topic>/review.md`；
查**接受了什么、范围到哪、取代了谁** → `decisions/<topic>/decision.md`；
查**某次运行用了什么输入、得到什么** → `evidence/<run>/README.md` 与该任务子目录的原始输出；
查**现在哪份契约是 candidate、哪份 accepted** → 不在这里，[registry/catalog.json](../registry/README.md)。**这里只记事件，不维护状态清单。**

## 红线

约束**任何在这里落字的人**。各条的道理在 README 与 skill 里，这里只留结论。

- **只追加，不改写。**重跑是新的 run，推翻是新的决定；旧记录连同它当时的输入一起留着。
- **没跑过就没有 evidence。**预期结果、样例输出、计划中的验证一律不进；失败、超时、缺工具照实进。
- **有限检查不写成无条件证明。**每份 run README 写状态规模、关掉了哪些故障路径、公平性假设；引用它的地方沿用同一边界。
- **三个实质候选才是 proposal。**改名、调参、空选项不算；凑不齐就不建。
- **接受只认有权者。**评审通过、作者推荐、模板齐全、文件存在都不提升状态；换个目录也不。
- **过程材料不进来。**计划、派发、进度、任务日志归 `tmp/`。

返回[设计知识的准入与归属](../AGENTS.md)。
