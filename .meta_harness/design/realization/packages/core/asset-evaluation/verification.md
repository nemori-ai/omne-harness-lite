## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 11 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

# asset-evaluation 验证与证据

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`capability.asset-evaluation/v3`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/asset-evaluation` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**168 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 10 项 core-local、1 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

## 当前3实际形式执行（2026-09-26）

[2026-09-26-formal-core-v3](../../../../record/evidence/2026-09-26-formal-core-v3/README.md) 保存本次正式3输入的实际模型、指定变异、原始输出与完整封存。主调度核32冻结资源、630 SHA、631归档字节及263主Alloy／28 XML读数，独立spec-reviewer核对应性无阻断。原18命令6 run SAT/12 check UNSAT，13既有变异全部匹配规定；按各原command有限scope，不把按构造的团队来源/根身份/PRE-2当实现保护。Alloy未登记正式task，不增formal binding。旧证据保留原输入；本次模型执行不签收产品实现、W6真实组合或人的最后总体门。

契约侧的证据义务权威在 [`spec/capabilities/asset-evaluation/verification.md`](../../../../spec/capabilities/asset-evaluation/verification.md#证据义务)（V-1～V-11、SC-1～SC-3）。
本页只登记**落在本节点上的那一部分**；前提 PRE-1～PRE-9 的兑现归组输入的一方与装配。

## 证据义务

| 来源条款 | 需要什么证据 | 当前状态 | owner 与闭合条件 |
|---|---|---|---|
| V-1 结构性质 (i)～(x) | 契约侧是 Alloy 模型 `Evaluation.als`（**不是 formal task、不可绑定**）；实现侧须有对应的规范场景或性质测试，否则模型结论落不到实现上 | 未开始。契约侧的依据是 M31 之后的那次重跑（[契约验证入口](../../../../spec/capabilities/asset-evaluation/verification.md#已执行组合根只作身份之后的-alloy-运行2026-09-25)：十八条命令、十三个变异体与预期一致，**未登记为 formal task**；原始输出已在 [2026-09-25-alloy-asset-evaluation](../../../../record/evidence/2026-09-25-alloy-asset-evaluation/README.md) 登记）；它**不建失败值**（`compositionCycle`、`categoryUnsupported`），M31 的三处改动按构造、不作证据 | 本节点：选几条模型性质写成实现上的性质测试（随机持有、锁、禁用组合）；随机生成器产出含 plugin 或 sub-agent 的组合时，断言结果是 `categoryUnsupported`，不是一份结果 |
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
| `defaultBodyContracts`（M51，唯一组合根） | 六类的键齐全，每个键上的值就是对应正文包导出的那一份（同一引用）；用它构造 asset-model 判定对象不抛出；错类由 asset-model 节点的类型测试覆盖 | 未开始 | 本节点 |
| `evaluationInputFingerprint`（本节点给的缓存键） | 改输入里任何一项（含 `standing`、`workspace`、会话配值、选用版本、动作集、`root.references`）指纹都变；成员次序不同的同一输入指纹相同 | 未开始 | 本节点 |

**修订波（2026-09-25 公开面）**：design 新增「[公开面](design.md#公开面)」一节（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)），只把既有入口归为公开函数面，不新增语义，上表证据义务不变；AE-5 的装配清单一半改指接口契约 `capability.assembly-manifest/v2`（`root.references` 的读法不在该接口里，仍受阻）。这一面成立的静态前提即 SC-1 那条 import 白名单（候选；`@deepseek-ai/cordis`、`@omne-harness-lite/kernel-basis`、`@omne-harness-lite/storage` 与任何插件包都在白名单之外），**规则尚无**（owner `tools/ts-checks`）。

## 实际执行

尚无实现运行。源码不存在。契约侧 Alloy 原始输入与输出已登记在 [2026-09-25-alloy-asset-evaluation](../../../../record/evidence/2026-09-25-alloy-asset-evaluation/README.md)；当前 `Evaluation.als` 与记录输入同 SHA256 `6935da2259130aafea0e770dad7c94578152fd517e3ef5d2f7bd006a8bba505f`。这次有限结构检查不是实现证据，也不是可绑定的 formal task。

## 覆盖缺口

- **契约的每一条都没有实现侧证据**：没有源码，空绑定表与此一致。owner：本节点。
- **Alloy 模型不可绑定**：2026-09-25 的原始输出已登记，输入与当前冻结模型一致；有限结构结论仍不能代替实现侧性质测试（V-1 行）。owner：本节点（实现性质测试）。
- **两个诊断的内容不可比对**：`cycle`、`category` 的具体内容契约豁免了确定性（S-11 的两处例外），有几个环、几类读不了时，V-10、V-11 只能核「有没有、首尾相接、类别在不在读不了的那两类里」，不能逐字核（E-7 A 支只有一个一元环，逐字核得了）。这是契约的选择，不是缺证据。

## 独立评审

2026-09-25 本节点随 N1 批（`core` 十五个纯模块）经一次独立的架构评审（只读结构核对，无运行）：本节点建议 1、范围外 1，另有 asset-model 那条建议落到本节点，无阻断、无应修；主线据此裁定 [D-060 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) M51、M52（批的结论见同节 N-28）。**处置不等于评审闭合**——是否闭合由复审判断。

| 编号 | 发现 | 处置 | 落点 |
| --- | --- | --- | --- |
| 建议 5 | 包依赖比 catalog 多四条边（skill-package、slash-command、connector 三条规则来源边与 content-blocks 一条工具边），已隐含在文字里但没有单列 | 按 M52：依赖表逐行单列，并写明哪三条已登进 catalog、哪一条是工具依赖不进 catalog | design.md「实现路径」包内依赖一条、依赖表与其下「不在 catalog 原有登记里的四条边」一段 |
| 范围外 | 规则来源的三份契约不登 catalog，规格演进的消费者影响分析会漏本节点 | 按 M52：主线把 `data.skill-package#S-13、S-17`、`data.slash-command#S-6、S-11`、`data.connector#S-11` 登进 catalog（本节点不改 registry） | 同上 |
| 建议 3（asset-model 节点提出，后半落本节点） | `BodyContracts` 三处组合根，分叉时没有检查失败 | 按 M51：本模块成为唯一组合根，导出 `defaultBodyContracts`；资产治理与注册表 import 它 | design.md「实现路径」第二条、依赖表「被消费」一行、状态一节、AE-7；本页新加一行 |
| 按节点备注 | 公开面五个函数多于契约的两个操作；AE-6 签名对齐是与资产治理的开放交接 | 三个 S-23 函数是契约规则的投影、与第 4 步共用一份实现，不改；AE-6 已由 N-22 推导接受为已对齐 | design.md AE-6 |

## D-068 当前验证epoch

当前设计输入为 `capability.asset-evaluation · v3`，规范资源在 [acceptance.json](../../../../record/decisions/core-implementation-spec-reconciliation/acceptance.json) 精确冻结。原包义务和既有证据保留原输入；补CB坏名未解析、TD指定拒绝、SA两行表示优先／工具名字128/129长度或AM/AE新标准正文闭包的本节点增量。完整source release、旧资源公开闭包、W6组合和逐ID接受尚待执行；用户最终整体接受未发生。历史formal run实际版本及注释差异分别核对，不把登记任务当已跑。
