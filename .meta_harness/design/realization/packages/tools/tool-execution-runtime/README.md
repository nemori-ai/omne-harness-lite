# tool-execution-runtime

- kind：`provider`
- 对象与设计修订：状态 `candidate`，2026-09-25 首稿，尚无实现修订。兑现 `omne-harness-lite-design-2026-09-15 · capability.tool-execution-runtime · v1`（[契约](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md)，状态 `candidate`，未接受、未冻结；设计依据 PF-006 rev 19）
- 源码位置：`packages/tools/tool-execution-runtime`——**尚未建包**。第一层 `tools` 由 [D-039](../../../../record/decisions/assets-runtimes-split-and-rulings/README.md) 拍板（tools 取候选 C）；布局规则见[两层布局](../../../README.md#packages-的两层布局)
- 契约采用与边界依据：**一个 Cordis 插件、一条 fiber、只 inject 存储与时钟**（[capability-split-tools 候选 C](../../../../record/proposals/capability-split-tools/design.md#装配草图与为什么这样切)，D-039 接受；候选 D「两条 fiber」不采用，触发条件写在 [design.md](design.md#关键选择)）；实现起点自研（[D-032](../../../../record/decisions/tool-execution-runtime-baseline/README.md)），DSH `jobs` 与 `local-execution` 只借鉴避坑。
  会话日志追加、放行核对、会话资产注册表、落点求值都是**调用时现取的可选依赖**，缺席各按契约 [S-47](../../../../spec/capabilities/tool-execution-runtime/v1/contract.md#s-47-依赖的提供者不可用) 收场，不进 inject。
  执行者（本地工具、MCP 桥、技能脚本）是**向本服务登记的贡献**，不是依赖。`capability.tool-admission` v1 **本批无提供者**，runner 以全拒件顶上——见 [design.md 的消费者表](design.md#谁消费本节点谁被本节点消费)

## 分层状态

四项分别陈述，不互相补齐。

- 语义接受范围：**未接受（候选，待 D-041）**。契约仍是 `candidate`；[D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md) 是待产品负责人签字的草案。契约里「主线裁定」一类依据的长期落点是 [D-040](../../../../record/decisions/mainline-self-rulings-2026-09/README.md)，尚未逐条追认。本节点的设计同样未被接受
- 可实施范围：本节点声称兑现的条款逐条对在 [design.md 的投影表](design.md#契约责任到插件服务与操作)：S-5～S-45 的操作与执行者一侧、S-46 左列、S-47、S-48、S-62、S-63 的「不在」一支。**尚未建包、没有一行源码**。
  2026-09-25 随契约修复波 3 对齐（[D-040 §八](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)）：`submit` 带 `report` 并核会话、运行、尝试三者（M33、M46，原缺口 T-1 闭合）；送达通知只在本进程内（M42）；JSON 列严格无损读写（M36）。
  同日独立评审（N3）之后按 M70、M71、M74、M75 修订：记录条目的出站项与会话日志幂等键带 `seq`、日志一侧按耐久状态判「已在」（M70）；执行者登记与撤下不经服务状态闸，撤除次序须由装配显式驱动（M71）；答复形状校验判不了收这次执行 `failed{schema_unsupported}`（M75）；`late` 经据点读面 `runAttemptFacts` 现读（M74）。处置逐条见 [verification 的独立评审](verification.md#独立评审)。
  **有前提：`runAttemptFacts` 读面**（M74）——S-16、S-19、S-25～S-29、S-41 的每一次收场都要落账，账里的 `late` 要这份读面；它没有契约、产品装配里没有提供者（验收装配以只答测试种子的替身顶上，`apps/cli` C-16），读不到时按失败映射收场，不给过渡值。
  **兑现不了、受阻的**（在 [verification](verification.md#覆盖缺口) 登记，主线处点名）：S-42——落盘前那一关由谁驱动、结论怎样交回本能力都没有操作面（契约 G-6，M43 本程不补），本节点本批一律按「那一关不可用」落；S-13 模型调用那几项（契约 G-19）、S-62 第 9 条的观察者推送（G-17）兑现不了、不写过渡值；S-13 的 `late` 经读面现读，但读在落账事务之外，与 `data.call-accounts/v1#S-39`「落下时」之间有一个漏标窗口、本批没有共同存储对象（缺口 T-4，报主线）；S-19／S-22 的送达目标（会话日志追加面，契约 G-1）、S-21／S-23 ② 第 2 条的会话持有租户读面（G-12）、S-38 第 2 步的落点（G-4）、S-20 第 4 步的关卡（G-5）都没有提供者；参数与答复形状判不了（含判定超时）已由契约定为 `failed{schema_unsupported}`（N-22、N-24、M75），本节点以可终止的判定工作线程兑现，但判定时限与 `pattern` 上限的值未登记（`data.tool-definition` G-16，缺口 T-16 的残留）
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **九条**（S-7、S-13、S-16～S-20、S-29、S-30），全部绑到契约自己的形式任务 `tool-execution-runtime-v1-execution`（run [`2026-09-25-formal-assets-runtimes`](../../../../record/evidence/2026-09-25-formal-assets-runtimes/README.md)，退出 0、无反例），只绑「有去保护配置证明它会失败」的那几条性质；那些否定运行的原始输出**待下一次证据 run 入库**（[D-040 §八 M54](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），在那之前是每条绑定共同的弱点。**它们证的是契约模型，不是本节点的代码**——每条 `assumptions` 写明模型盖不到什么。进展任务 `…-execution-progress` 同 run 退出 0，**不绑**（理由在 [verification](verification.md#实际执行)）。规范场景 S-50～S-69、故障注入与本节点自己的交错演练**一条都没有**
- 实际验证：**尚无**。没有源码、没有测试、没有集成运行；上面那次 TLC 运行只是契约层的模型检查

## 按当前问题展开

| 当前问题                                                                                         | 阅读入口                      |
| ------------------------------------------------------------------------------------------------ | ----------------------------- |
| 插件边界、服务面、为什么只 inject 存储与时钟、执行为什么不是子 fiber、送达为什么走发件箱、装卸配对 | [实现设计](design.md)         |
| 哪条承诺由哪份证据支持、前提是什么                                                               | [绑定表](bindings.yaml)       |
| 证据义务、实际跑过什么、还缺什么                                                                 | [验证与证据](verification.md) |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
