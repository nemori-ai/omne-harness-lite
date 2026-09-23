# 决定

本家族拥有已发生的接受选择、理由、范围与取代关系。每个持续维护的主题是一个子目录信息包，先读其 README，再按当前问题展开。

## 新建或接续主题

- 已发生接受、需要形成长期记录时，从本地 [topic 模板包](.templates/topic/README.md) 复制为 `<topic>/`；包内为入口和 `decision.md`。
- 接续已有主题先读该主题入口，保留有效正文、精确来源和实际状态，只补本次缺口。
- 尚未接受的决定文案留在来源提案中，不作为本家族的实际主题；决定至少引用一份来源提案或研究，并能定位有权者实际接受的修订与范围。

## 准入门槛与停止条件

- 必须能定位接受者/权限、日期或记录、精确修订、接受范围、保留前提与取代关系。
- 缺少实际接受就停在 proposal；部分接受只记录该部分，不能把待实现、待验证或 reviewer 建议并入决定。

命名、裁剪与跨家族引用遵循 [信息包约定](../../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

本节按实际子目录链接决定信息包，保留 D-NNN 编号与取代关系；
**没有决定文件就是没接受**，本节不因为一份提案写得完整而为它添行。

| 决定 | 接受了什么 | 接受者与日期 | 明确**不表示** |
|---|---|---|---|
| [D-019：定向 fork pi-ai 用于 OpenRouter 传输](model-provider-pi-ai-fork/README.md) | 传输与模型协议的**实现选择**：以 pi-ai 的 OpenRouter provider、模型目录、协议请求与流/工具解析为基线做定向 fork | 产品负责人，2026-09-16 | fork 已做出、达到产品质量或可接入；模型执行与预算契约被接受（**两者在本设计链里还不存在**）；费用与身份已验证 |
| [D-022：CLI-TUI 交付形态](cli-tui-delivery-form/README.md) | 五条**产品形态与交付深度**：交付到什么深度、面向生产分发且多同事进同一组织、会话与 Run 与工具执行在用户本机、中心治理节点是独立应用、交互层包家族名 `frontend` | 产品负责人，2026-09-22 | 接受[任何技术选型](../proposals/cli-tui/alternatives.md)；接受任何契约；建立任何节点或包；接受 SYS-DEPLOY 的重读 |
| [D-023：接受租户领域的设计链](tenant-domain-design-acceptance/README.md) | 四类对象：**五份契约 v1 全部条款**（含各自已知缺口作为显式缺口）、能力拆分「维持五份 + 两处修正」与共用数据契约的合并、**六个 provider 节点的设计**作为实现路径、**PF-001 投影 v1** 作为实施入口；catalog 五条翻 `accepted`、18 项资源冻结 | 产品负责人，2026-09-22 | 任何实现存在或符合；任何验证完成；各契约缺口与投影 18 项 Q-n 已闭合；Cordis 采用版本、存储已定；`covers.json` 已复核 |
| [D-024：租户领域的限界上下文名 `tenancy`](tenancy-domain-name/README.md) | 一个名字：`packages/tenancy/<node>` 这一层叫 `tenancy` | 产品负责人，2026-09-22 | 布局判据改变；任何契约或节点语义改变；Cordis 采用版本已定 |
| [D-025：Cordis 采用版本 4.0.4](cordis-adoption-version/README.md) | 一个版本号：产品包依赖 `@deepseek-ai/cordis` 4.0.4；basis 与三条待核对主张按它重取证 | 产品负责人，2026-09-22 | 任何 Cordis 语义已被核实（看 probe）；DSH 其他复用组件的版本已定；后续补丁自动采用 |
| [D-026：基础设施持久化的四条选择](infrastructure-persistence-choices/README.md) | 无 in-memory 实现；SQL 经 Kysely 由配置切 sqlite(`node:sqlite`)/pg；队列先 redis；本地日志 JSONL；SQL 提供者进租户第一程 | 产品负责人，2026-09-22 | 存储协议接口已定；`infra`／`tenancy-host` 名已拍板；跨进程存储协调已定 |
| [D-027：`infra`／`apps/tenancy-host` 名拍板，sqlite `synchronous=NORMAL`](infrastructure-names-and-sqlite-durability/README.md) | 两个名字不再是候选；开发期 sqlite 持久性档位 `NORMAL`，OS 崩溃可丢最后一段已提交事务作已知边界 | 产品负责人，2026-09-23 | 治理中心交付面已有 PF；断电级持久已承诺；pg 持久性已定 |

**编号**：`D-` 是[决定的稳定编号](../../registry/README.md)。
D-019 是**迁入时保留的原号**——同一次接受在旧谱系里就是这个号，
接受事实只发生过一次，不为它另分配第二个号。
D-022 至 D-027 是**新分配**的：旧谱系已分配到 D-021，新号从其后继续，避免与尚未迁入的存量决定相撞。

**接受契约的只有 D-023。**D-019 与 D-022 各自写明它**不表示**接受任何契约，那是它们当日的范围声明，不因 D-023 改写；
[catalog 里五份契约的 `acceptance` 都指向 D-023](../../registry/README.md)。
记录旧谱系已发生的接受事实及后续局部取代时，同样写明它**不表示**新 v1 的 catalog、
依赖或实现已经接受；目标资源的精确采用由 [registry](../../registry/README.md) 登记。

存量 topic 尚未从 `design_legacy/decisions/` 整批迁入，
**迁入时逐条恢复编号、取代关系并核对链接**，不整批复制；
那批记录**已随旧设计链退役**，不能被引为现行规则。

本节只导航实际迁入的决定信息包，不形成第二份接受状态清单。

判断方法按需读 `harness-design-handbook` skill 的「设计选择」。
返回 [系统设计链](../../README.md)。
