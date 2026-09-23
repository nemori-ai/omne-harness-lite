# 治理中心入口层与运维面的落点

**选择对象**：治理中心的**入口层**（无词条；客户端 ↔ 中心的接入与身份核实）以及**运维面**（无词条；只在中心所在机器上可读的完整体检），
在 Cordis 装配里落在哪、由谁拥有。它决定 [PF-017](../../../product/PF-017-governance-center-as-deployable-application/README.md)
「认出一个来者只有一条路」「要么整个起来要么不起来」「运维者没有任何一扇门」三条各由哪一个结构点保护，也决定入口契约由哪个节点兑现。

- **当前状态：候选 A 已由 [D-028](../../decisions/governance-center-design-acceptance/README.md) 接受（产品负责人，2026-09-23）。**本包不产生接受；推荐、评审与模板齐全都不提升状态，接受事实只在那条决定里。
  已有一次 architecture-reviewer 评审（2026-09-23），记录待主线整理进 [review.md](review.md)。
- **本次终点与范围**：四个实质候选——入口层三个落点（A 独立 fiber、B 并入装配、C 三扇门）与运维面一个替代（D 进程外命令）——
  各自怎样承载性质表、哪条性质失去保护点、哪个反查信号出现、可计数代价；入口契约为什么是一份组合契约、传输为什么不进契约；
  以及装配草图与「为什么不拆、为什么不并」的长期家。**不写契约，不写提供者设计。**
- **输入基线**：
  - PF-017（§5.1、§5.3、§6.2～§6.6、§6.12、§6.13、§6.17 为主责）——本包起草时是 rev 1 草稿，同日接受为 rev 1，随后升 rev 2（断电边界回写）；
    本包对着它 2026-09-23 第二轮修订之后的正文（草稿内修订，不升 rev）；主线的产品层裁定已落进正文，本包标「主线裁定」的只剩契约层与实现层的裁定；
  - [PF-016](../../../product/PF-016-cli-tui-delivery-surface/README.md) rev 3 §4、§5.6、§6.9；[PF-001](../../../product/PF-001-identity-scope-and-agent-constraints/README.md) rev 15；
  - 五份契约 v1，已由 [D-023](../../decisions/tenant-domain-design-acceptance/README.md) 接受；
  - [apps/tenancy-host](../../../realization/apps/tenancy-host/README.md)（本包起草时入口层身份核实明写为缺口）与 [apps/cli](../../../realization/apps/cli/architecture.md#与其他应用的边) 的两条待立边；
  - [basis](../../../basis/README.md) 四条条目；Cordis 4.0.4（[D-025](../../decisions/cordis-adoption-version/README.md)）；
  - 本批双盲读数（领域读数先于任何机制视角封存；机制读数不读领域读数）——它们是任务区过程材料，**本包不以它们为依据**，被引用的理由都已写进本包。

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：两个轴——入口层落在哪个运行单元、由哪个节点兑现；运维面在不在进程内 |
| 现有能力覆盖 | 五份 v1 契约承载认人（AI S-17）、身份推导（OG S-36）与各操作的授权；版本关、公开体检、答复先后、中心标识、完整体检**没有承载者**，见 [design.md](design.md#现有能力如何承载) |
| 剩余责任 | 一份组合契约：把三份契约的操作投影到线上、施加同一条判定次序，外加中心标识与完整体检，见 [design.md](design.md#剩余责任与能力演化) |
| 三个实质候选 | **齐，四个**：A、B、C 回答入口层落在哪，D 回答运维面在不在进程内；四个的关键反例[互不重复](alternatives.md#反例是否互不重复)。另有两条运维面路径因约束排除，排除依据保留 |
| 接受权限 | **本包不产生接受。**接受走 [record/decisions](../../decisions/README.md) |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要选的是什么、必须保留哪些性质、现有能力承载到哪、剩下什么责任 | [设计正文](design.md) |
| 候选 A 在 tenancy-host 进程里是什么形状：装载顺序、判定次序、身份推导、运维面、提交点、跨进程这条边 | [装配草图](design.md#装配草图) |
| 为什么入口层是一条 fiber、不并进装配、不拆成三扇门；运维面为什么不并进入口层 | [为什么不拆、为什么不并](design.md#为什么不拆为什么不并)（每条可单独引用） |
| 四个候选差在哪、各失去哪条保护点、什么证据会翻盘 | [候选与取舍](alternatives.md) |
| 入口契约为什么是 composition、传输为什么不进契约 | [alternatives 两节](alternatives.md#入口契约为什么是一份-composition-契约) |
| 评审了哪个修订、哪些问题已处置 | [评审记录](review.md)（尚无实际评审） |

## 后续消费

以下全部**待立或待修订**，本包只是它们的候选依据：

- **入口契约**：`spec/compositions/governance-center-entry/v1`（待立）——「治理中心入口」，一份组合契约；中心标识与信封形状随它的 Schema。
- **提供者节点**：`realization/packages/tenancy/governance-center-entry/`（待立）——两个插件（入口层、运维面）；传输的候选、中心自身的故障到达完整体检的承载者在那里定。
- **待修订**：[apps/tenancy-host](../../../realization/apps/tenancy-host/README.md)（装载清单末尾加两项、迁移合成加一个片段、撤除次序、监听与本机通道配置；「入口层身份核实——不写」与「不裁本应用与治理中心的关系」两处）；
  [apps/cli](../../../realization/apps/cli/architecture.md#与其他应用的边) 两条边的对端与契约坐标改指入口契约。
- **结构检查扩展**：`restricted-call-sites` 覆盖入口层并加三个方法限定，新规则两条（主线已排）；本包另建议一条，见 [design.md 交接缺口](design.md#交接缺口)。
- **消费前提**：PF-017 被接受（已发生，2026-09-23）；P-5、P-6、P-8 升格为 basis 条目（**未做**，仍是共用主张）。契约与节点已随 D-028 接受；绑定仍只指向已登记的 formal task，**绑定不提升任何状态**。
