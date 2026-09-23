# hooks 兼容层基线：fork DSH 协议库、fork 两个桥、全自研，还是只做离线转换

**选择对象**：把 Claude Code / Codex 的 hooks 配置（事件名、matcher、handler、输出 JSON）翻译成本项目
[拓展件](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)的那一层，从什么起步。
**推荐 A**：fork DSH `hook-protocol` 里与运行时无关的四个文件（matcher、codec、merge、detached）加结果类型，
runner、导入、方言映射表与结论交付全部自写；B（fork 两个桥）与 D（只做离线转换）各有硬反例被排除，
C（全自研）与 A 只差起步的一次性收益，**有一个区分实验会把选择翻向 C**。

- **当前状态：候选。**没有任何部分被接受；推荐不是接受，**尚未记录实际评审**。
- **本次终点与范围**：只选兼容层的**起点**（代码来源、fork 边界、导入与运行两半的分工），
  并列出无论选谁都要由产品或协议另定的缺口。**本项目自己的拓展点协议**（位置的调用契约、每类拓展件的报错策略、结论条目形状）
  **是阶段 3/4 的设计，不在这里定**；兼容层站在它之上。
- **输入基线**：
  研究 [loop-extension-hooks-compat](../../../../research/loop-extension-hooks-compat/README.md)（首轮 2026-09-23；Claude Code 2.1.280 文档快照、Codex `5c5308f`、DSH `c291e79`）；
  产品正文 [PF-012 rev 9 §5.8](../../../product/PF-012-agent-loop-and-run/design.md#58-loop-拓展点)、
  [PF-002 rev 13 Loop Extension](../../../product/PF-002-assets-settings-and-permissions/design.md#loop-extension)、
  [PF-008 rev 5 §6.1](../../../product/PF-008-human-in-the-loop/design.md#61-永远等着系统不替人作答)、
  [PF-005 rev 5 执行环境权限](../../../product/PF-005-execution-environments-and-sandboxes/design.md#执行环境权限)；
  产品负责人 2026-09-23 的裁决（不设放宽、否决表与「停住」译法、工作区资产权限取最严值）以这几份正文的落字为准，
  拍板记录见 [PF-012 decisions](../../../product/PF-012-agent-loop-and-run/decisions.md#一拍板记录)；
  [SYS-KERNEL](../../../foundation/cross-system-constraints/requirements.md#sys-kernel)；
  词条 [UL-loop-extension](../../../ubiquitous_language/terms/capabilities-and-composition.md#ul-loop-extension--拓展件--loop-extension)、
  [UL-loop-extension-point](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-loop-extension-point--loop-拓展点--loop-extension-point)、
  [UL-wait-primitive](../../../ubiquitous_language/terms/agent-runtime-loop.md#ul-wait-primitive--等待原语--wait-primitive)。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：兼容层的起点，见 [design.md](design.md#需要作出的选择)；拓展点协议明确排除在外 |
| 现有能力覆盖 | 研究给了映射全表与三方事实，产品正文 rev 9/13/5 已答研究撞上的七个缺口中的五个半，见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 兼容层是 Loop Extension 下的一种拓展件及其导入，**不提新维度**；另有十一项要产品或协议另定，见 [交接缺口](design.md#交接缺口) |
| 三个实质候选 | **四个真实路径**：A、C 可行且性质兑现相同、只差起步；B、D 被硬反例排除但各留可取之处与翻盘条件。都来自研究与指令点名的真实做法，不是陪衬 |
| 接受权限 | **本包不产生接受。**作者推荐、模板齐全都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要保什么性质，现有正文与研究承载到哪，剩下什么要别人定 | [设计正文](design.md) |
| 四条路各自怎么兑现、代价与反例、为什么推荐 A、什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 评审了哪个修订，哪些问题已处置 | [评审记录](review.md)（尚无实际评审） |

## 后续消费

- **尚无消费者采用**；预期下游是拓展点协议（阶段 3/4）与兼容层的提供者设计，二者都未起草。
- **区分实验**（A 与 C）未跑，归实施计划第一步，不阻塞协议设计。
- **交接缺口 G1–G11** 需各自 owner 接住；其中 G1、G2、G4、G7 应在协议起草前交出，理由见 [alternatives.md](alternatives.md#推荐与仍待区分的事项)。
- 本包用「兼容层」「导入报告」作描述性说法，**不是统一语言词条**；若进入规格要当概念用，先由词表 owner 立词。
- 宿主升级时按研究包的版本 token 复核；研究结论变了，本包的推荐理由随之复核。
