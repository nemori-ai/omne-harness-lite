# asset-evaluation 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/asset-evaluation/verification.md`](../../../../spec/capabilities/asset-evaluation/verification.md#证据义务)（V-1～V-9、SC-1～SC-3）。
本页只登记**落在本节点上的那一部分**；前提 PRE-1～PRE-9 的兑现归组输入的一方与装配。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 结构性质 (i)～(x) | 契约侧是 Alloy 模型 `Evaluation.als`（**不是 formal task、不可绑定**）；实现侧须有对应的规范场景或性质测试，否则模型结论落不到实现上 | 未开始；随机生成的持有不得含 plugin 与 sub-agent（AE-1） | 本节点：选几条模型性质写成实现上的性质测试（随机持有、锁、禁用组合） |
| V-2 四格齐全的一次求值（S-33，E-1） | 五个集合与 E-1 逐项相等；同一输入重放；改一项权限只动那一项 | 未开始（M31 之后不再受阻：E-1～E-6 不含 plugin 与 sub-agent） | 本节点 |
| V-3 先禁用后替换（S-34，E-2a、E-2b） | 规范场景 | 未开始（M31 之后不再受阻：E-1～E-6 不含 plugin 与 sub-agent） | 本节点 |
| V-4 清单读入的留痕（S-35，E-3） | `readWorkspaceCarrier` 对 E-3 的持有与 `dropped` 逐项相等 | 未开始 | 本节点 |
| V-5 设置不跟过去、权限的约束跟过去（S-36，E-4 五支） | 规范场景 | 未开始（M31 之后不再受阻：E-1～E-6 不含 plugin 与 sub-agent） | 本节点 |
| V-6 输入不合法时整体拒绝（S-37，E-5 八份） | 八份输入都得 `invalidInput`，返回里没有任何 `EffectiveAssembly` | 未开始 | 本节点；C14（M31 新增）另补一份输入 |
| V-7 装配给的保证（S-29 左列） | 选型声明 ＋ 架构评审 | 不在本节点：一致读、分享现读、调用方核实、清单来路都归组输入的一方 | 资产治理（读面与快照面）、据点装配、读工作区的节点 |
| V-8 判下来用不了的退回下一层（S-41，E-6 六支） | 规范场景 | 未开始（M31 之后不再受阻：E-1～E-6 不含 plugin 与 sub-agent） | 本节点 |
| V-9 执行权限项的 `tenantAutoWritable`（S-42） | E-1 的真、假两种 | 未开始（M31 之后不再受阻：E-1～E-6 不含 plugin 与 sub-agent） | 本节点 |
| SC-1～SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载) | 未开始。SC-1 的时钟那一半由现有 `no-wall-clock` 规则在包落地后覆盖；其余规则不存在 | 本节点提出形式；SC-2 扫的是消费者包 |
| S-43 成环即拒（M32 `compositionCycle`） | 根的引用列表指回 `root.definition` 得 `compositionCycle`、`cycle` 非空且首尾相接、返回里没有 `EffectiveAssembly`；Skill 与 Tool 互引不算环、照常得结果；环与不合法输入同时成立时报 `invalidInput` | 未开始 | 本节点 |
| S-23 界与挑选的三个导出函数 | S-23 产品原话表七行各一条单元检查；同一组用例经 `evaluate` 第 4 步得同一结论（共用实现的回归） | 未开始 | 本节点；资产治理的写时守卫用例另在 asset-governance 节点 |
| `evaluationInputFingerprint`（本节点给的缓存键） | 改输入里任何一项（含 `standing`、`workspace`、会话配值、选用版本、动作集、`root.references`）指纹都变；成员次序不同的同一输入指纹相同 | 未开始 | 本节点 |

## 实际执行

尚无。源码不存在。契约侧 Alloy 运行的结论只在契约验证入口有记录，不是本节点的证据。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **含 plugin 或 sub-agent 的组合没有可测的规范**（AE-1）：`evaluate` 走到它们时契约没有合规返回，这一支无从演练，也无从写性质测试。owner：主线。
- **Alloy 模型不可绑定**：结构性质只有模型侧结论；实现侧须另写性质测试（V-1 行）。owner：本节点。
- **契约验证入口尚无 S-43（成环即拒）的证据义务行**：本页先按契约正文登记（上表 S-43 行），入口补行之后改引。owner：契约 owner。
