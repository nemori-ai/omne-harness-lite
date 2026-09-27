# 块 C 模型请求运行时的能力拆分：几份能力、几个插件、落在哪个领域

**选择对象**：机制读数给出的三个落点 #8 对象各自怎么切——

- **P-1 档案目录**：在治理中心；
- **P-2 模型请求运行时**：在会话据点；
- **P-3 模态转换**：在会话据点；每个键上的转换件 P-4\* 是它之下的子插件，落点 #7。

具体说，要回答三个问题：是独立一份能力、并进已有能力，还是互相合并；由几个插件兑现；落在哪个领域名下。

**作者推荐**：
- **P1-A** 独立插件、独立能力（`capability.model-profile-directory`），放在中心，档案与凭据都归它，据点由同一服务面的读提供者来读；
- **P2-A** 选择与调用放在同一份能力、同一个插件里；一次调用是宿主上的 effect，不是 fiber；传输适配是内部依赖，不做服务；
- **P3-A** 独立登记表插件；每个键一条子插件。

合起来是 3 份能力契约、中心 1 个插件、据点 4 + k 个插件、5 个服务键；领域名候选 `model`。
理由与改票条件见[候选与取舍](alternatives.md)。**推荐不是接受。**

- **当前状态：候选。**没有评审，也没有决定；[`record/decisions/`](../../decisions/README.md) 里没有对应的决定文件。
  主线此前已按机制读数把任务区的 S16、S17 简报改成了与推荐相同的切法；本包补上正式的比较，并给切分理由一个长期的家。
  **推荐若没有被接受，那两份简报与正在起草的契约都要随之改。**
- **本次终点与范围**：
  - 三个对象各比较 3～4 个实质候选：承载方式、失去的保护点、反查信号、可计数代价，并写推荐与改票条件；
  - 把机制读数的装配草图与「为什么这样切」收进 [design.md 的独立一节](design.md#装配草图与切分理由)，后续的提供者设计引用那一节；
  - 领域名与包布局只列候选，**待产品负责人拍板**。
  - **不写**契约与提供者设计；**不改**产品正文、词条、领域对象条目、registry 与 [proposals 索引](../README.md)。
- **输入基线**（设计工作区为分支 `panqiwei/assets-runtimes-proposal-c`，基线 `9fb10ba3`，2026-09-23）：
  - **产品正文**：[PF-013](../../../product/PF-013-model-profiles-and-invocation/design.md) rev 8（rev 4 已接受，rev 5～8 全文待产品负责人确认）、
    [PF-012](../../../product/PF-012-agent-loop-and-run/design.md) rev 10、PF-009 rev 7、PF-004 rev 10、
    [PF-016](../../../product/PF-016-cli-tui-delivery-surface/design.md) rev 5、PF-014 rev 5、PF-001 rev 16、PF-002 rev 16。
  - **决定**：[D-019](../../decisions/model-provider-pi-ai-fork/README.md)（pi-ai 定向 fork）、[D-022](../../decisions/cli-tui-delivery-form/README.md)（中心与据点的分界）、
    [D-035](../../decisions/message-and-stream-baseline/README.md)、[D-058](../../decisions/message-and-shape-rulings/README.md)。
  - **契约**：
    - 候选：`data.model-profile`、`data.model-response`、`data.call-accounts`、`data.loop-extension`、`data.content-blocks` v2；
    - 已接受：`capability.organization-governance` v1、`composition.governance-center-entry` v1；
    - 起草中（任务区简报，不在本分支上）：S15 runner、S16a／S16b、S17。
  - **读数**（任务区 `tmp/assets-runtimes/readings/`，未入库）：领域读数 B、机制读数 C、对账 D；另有 `product-gaps-from-readings.md` 与 `pending-user-rulings.md`。
    **被下游引用的理由已全部收进 design.md**，不依赖任务区文件继续存在。
  - **未读 `design_legacy/`。**

## 准入核对

| 准入问题 | 答 |
|---|---|
| 选择对象清楚吗 | 是：同一组三个 #8 对象，每个回答「切成几份能力、由几个插件提供、落在哪里」 |
| 现有能力覆盖 | 见 [design.md](design.md#现有能力如何承载)：数据契约齐了，但档案维护、调用、转换都没有操作的主人；组织治理、资产治理、runner 各自覆盖一小角 |
| 剩余责任 | 见 [design.md](design.md#剩余责任与能力演化)：三份新增维度，加一处读面投影、一处已接受契约的扩展 |
| 三个实质候选 | **每个对象都齐了**。P-1：A 独立／B 并进组织治理 v2（外加收窄的 B′）／C 并进运行时（C1～C3 三种落法）；P-2：A 同在／B 选择独立／C 调用做 fiber／D 传输做服务；P-3：A 独立登记表／B 并进 runner／C 并进运行时／D 每件独立成拓展件。落选的每一个都有反例或已标价的代价，不是陪衬 |
| 接受权限 | **本包不产生接受。**作者推荐、模板齐全，都不提升状态 |

## 按当前问题展开

| 当前问题 | 阅读入口 |
|---|---|
| 要切的是什么、必须保留哪些性质（M-1～M-26）、现有能力承载到哪、还剩什么 | [设计正文](design.md) |
| **装配草图、inject 边、装卸责任、装配给 vs 协议给、为什么不拆（N-1～N-10）与为什么拆（Y-1～Y-3）** | [design.md「装配草图与切分理由」](design.md#装配草图与切分理由)——可以单独引用 |
| 每个候选的承载、失去的保护点、反查信号与代价；为什么推荐 A；什么证据会改票 | [候选与取舍](alternatives.md) |
| 领域名与包布局的候选 | [design.md「领域名与包布局」](design.md#领域名与包布局待产品负责人拍板) |
| 评审了什么、怎么处置 | [评审记录](review.md)（尚无） |

## 后续消费

- **下游**：
  - 能力契约 S16a `capability.model-profile-directory`、S16b `capability.model-request-runtime`、S17 `capability.modality-projection`（均在其他 spoke 起草中）；
  - 块 C 的提供者节点（`realization/packages/<领域>/…`，**尚未建**）；
  - 据点装配 `apps/runtime-host`（候选名）与治理中心的装配节点。
  - 推荐被接受之前，下游可以引用本包的草图与理由，但须标「候选」。
- **需要他方裁定的**：
  - 领域名 `model` 与中心侧装配节点名，由产品负责人在 G3 拍板；
  - 「隶属树内唯一」的读法，由主线／产品负责人裁定——它可能让 P1-B 重新被考虑；
  - 本版转换件能否发起模型调用，由主线裁定；
  - 入口组合 v2，由其 owner 起草。
  - 以上各项的闭合条件都在 [design.md 交接缺口](design.md#交接缺口)与 [alternatives.md 仍待区分的事项](alternatives.md#仍待区分的事项)。
- **接受**：走新决定；**接受权在产品负责人**。
