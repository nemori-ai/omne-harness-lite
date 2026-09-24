# asset-evaluation 验证与证据

契约侧的证据义务权威在 [`spec/capabilities/asset-evaluation/verification.md`](../../../../spec/capabilities/asset-evaluation/verification.md#证据义务)（V-1～V-11、SC-1～SC-3）。
本页只登记**落在本节点上的那一部分**；前提 PRE-1～PRE-9 的兑现归组输入的一方与装配。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 结构性质 (i)～(x) | 契约侧是 Alloy 模型 `Evaluation.als`（**不是 formal task、不可绑定**）；实现侧须有对应的规范场景或性质测试，否则模型结论落不到实现上 | 未开始。契约侧的依据是 M31 之后的那次重跑（[契约验证入口](../../../../spec/capabilities/asset-evaluation/verification.md#已执行组合根只作身份之后的-alloy-运行2026-09-25)：十八条命令、十三个变异体与预期一致，**未登记为 formal task、原始输出未入 record/evidence**）；它**不建失败值**（`compositionCycle`、`categoryUnsupported`），M31 的三处改动按构造、不作证据 | 本节点：选几条模型性质写成实现上的性质测试（随机持有、锁、禁用组合）；随机生成器产出含 plugin 或 sub-agent 的组合时，断言结果是 `categoryUnsupported`，不是一份结果 |
| V-2 四格齐全的一次求值（S-33，E-1） | 五个集合与 E-1 逐项相等，`root` 是 `root.definition` 且不在 `composition` 里；同一输入重放；改一项权限只动那一项 | 未开始 | 本节点 |
| V-3 先禁用后替换（S-34，E-2a、E-2b） | 规范场景 | 未开始 | 本节点 |
| V-4 清单读入的留痕（S-35，E-3） | `readWorkspaceCarrier` 对 E-3 的持有与 `dropped` 逐项相等 | 未开始 | 本节点 |
| V-5 设置不跟过去、权限的约束跟过去（S-36，E-4 五支） | 规范场景 | 未开始 | 本节点 |
| V-6 输入不合法时整体拒绝（S-37，E-5 十份） | 十份输入都得 `invalidInput`（含 M31 新加的 `root.references` 缺席、C14 两份），返回里没有任何 `EffectiveAssembly` | 未开始 | 本节点 |
| V-7 装配给的保证（S-29 左列） | 选型声明 ＋ 架构评审 | 不在本节点：一致读、分享现读、调用方核实、清单来路都归组输入的一方 | 资产治理（读面与快照面）、据点装配、读工作区的节点 |
| V-8 判下来用不了的退回下一层（S-41，E-6 六支） | 规范场景 | 未开始 | 本节点 |
| V-9 执行权限项的 `tenantAutoWritable`（S-42） | E-1 的真、假两种；E-4 五支皆假 | 未开始 | 本节点 |
| V-10 成环即拒并指出环在哪（S-43，E-7 三支） | A 支得 `compositionCycle`、`cycle` 列出环上的标识且首尾相接、返回里没有 `EffectiveAssembly`，不是 `invalidInput` 也不是 `categoryUnsupported`；B 支 Skill⇄Tool 不算环、照常得结果；C 支根被禁用 ⇒ `composition` 为空、`unresolved` 恰一条且 `referencedBy` 缺席 | 未开始 | 本节点 |
| V-11 读不了正文的一类即拒（S-44，E-8 四支） | sub-agent 那支得 `categoryUnsupported{agent_definition}`、plugin 那支得 `{plugin}`，都没有结果；plugin 被禁用那支成功、进 `unresolved`；环与 sub-agent 同时出现那支得 `compositionCycle`（判定次序） | 未开始 | 本节点 |
| SC-1～SC-3 | 见 [design「静态检查义务怎么承载」](design.md#静态检查义务怎么承载)；SC-3 随 M32、M45 扩到三个失败值 | 未开始。SC-1 的时钟那一半由现有 `no-wall-clock` 规则在包落地后覆盖；其余规则不存在 | 本节点提出形式；SC-2 扫的是消费者包 |
| S-23 界与挑选的三个导出函数 | S-23 产品原话表七行各一条单元检查；同一组用例经 `evaluate` 第 4 步得同一结论（共用实现的回归） | 未开始 | 本节点；资产治理的写时守卫用例另在 asset-governance 节点 |
| `evaluationInputFingerprint`（本节点给的缓存键） | 改输入里任何一项（含 `standing`、`workspace`、会话配值、选用版本、动作集、`root.references`）指纹都变；成员次序不同的同一输入指纹相同 | 未开始 | 本节点 |

## 实际执行

尚无。源码不存在。契约侧 Alloy 运行的结论只在契约验证入口有记录，不是本节点的证据。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **Alloy 模型不可绑定**：结构性质只有模型侧结论，而且 2026-09-25 那次重跑的原始输出**未登记进 record/evidence**——契约侧的依据目前只由契约验证入口的文字记录支撑。实现侧须另写性质测试（V-1 行）。owner：本节点（性质测试）；主线（把那次运行登记成 evidence run）。
- **两个诊断的内容不可比对**：`cycle`、`category` 的具体内容契约豁免了确定性（S-11 的两处例外），有几个环、几类读不了时，V-10、V-11 只能核「有没有、首尾相接、类别在不在读不了的那两类里」，不能逐字核（E-7 A 支只有一个一元环，逐字核得了）。这是契约的选择，不是缺证据。
