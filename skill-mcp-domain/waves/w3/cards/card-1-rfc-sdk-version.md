# MCP SDK 版本｜RFC-0001 与技术基础正文写 2.3.1，仓库实际采用 2.4.0

**接手本卡**

1. 先读当前修订、评论、条件和现存attempt。在本Issue评论声明认卡，写明负责的人、会话/agent实例、权限依据及现存执行核对结果。
2. 已获本卡派发时按该授权接手；尚未派发时向指定调度者请求领取。由授权调度者登记并读回唯一attempt，不能凭Assignee或认卡留言抢占执行。
3. 开工前核对[当前执行与交接](#当前执行与交接)中的分支、基线、写范围和task context。不涉及Git交付时明确不适用，仍须履行认卡和状态更新。
4. 在开工、关键进展、阻塞或范围变化、可审阅候选、暂停/接续和交付时及时交回事实。获授权的正文单写者更新摘要，指定调度者更新Project Stage。已有权限时直接执行并读回，不重复请示。
5. 交付时给出成果、验证和剩余责任，由有权者接受。有效决定读回后完成关闭与看板对账。部分接受不销整卡。

具体规则归[交付操作](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/agent-delivery.md)和[交付协议](https://github.com/nemori-ai/omne-harness-lite/blob/main/docs/engineering/delivery.md)。

## 身份与责任

- 交付层级：subtask
- 主工作类型：maintenance
- 交付线：integration
- 性质：design
- 契约变更：none
- 交付修订：1
- 创建操作标识：rfc-sdk-version-20261106-1
- 父交付卡：https://github.com/nemori-ai/omne-harness-lite/issues/1119
- 责任范围：MCP 官方 SDK 的版本事实。涉及已接受的 RFC-0001、系统架构正文 `docs/architecture/technical-foundations.md` 中的同一行，以及 `packages/mcp` 下几处转述这一行的注句。
- 卡负责人、主结果接受者及授权依据：PanQiWei。PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。2026-11-06 PanQiWei 在 Claude Code 会话中对开卡问题回答：发卡 1 与卡 3，「做完关卡」，由卡 #1119 的执行会话在 W4 期间做完并关卡。
- 受影响语义拥有者：RFC-0001 的拥有者 PanQiWei（front-matter `owner`）。系统架构正文 `technical-foundations.md` 的拥有者 PanQiWei。不涉及产品或契约成员。
- 调度者与执行者：卡 #1119 的执行会话（Claude Code，代 PanQiWei），在 #1119 的 W4 期间实施。
- 正文单写者：同上。

判定理由：

- 主工作类型取 maintenance。结果是让已接受的文字与已采用的依赖版本一致。没有新能力，没有要恢复的行为，成员实现与测试已按 2.4.0 完成。`docs/engineering/work-types.md` 把“维护依赖、工具、构建、文档”归 maintenance。
- 性质取 design。本卡只改设计与规格正文，不改代码与契约成员。
- 交付线取 integration，不取 tool-exec。`docs/engineering/delivery-lines.json` 中 `docs/architecture` 属 `integration.paths`，`docs/rfcs` 不在任何线的路径内。线内的 design 卡只能写本线拥有路径中的正文（`delivery.md`「卡属性与合法组合」），tool-exec 的卡写这两处会得到 `scope-outside-line` 或 `scope-integration-path`。`packages/mcp` 的注句在 tool-exec 路径内，integration 线的 design 卡可以写任意路径中的正文。
- 契约变更取 none。不改任何契约成员的公开面。

## 目标与范围

已接受的 RFC-0001 revision 4 与系统架构正文都写 MCP 客户端与服务端“各 2.3.1”，node 适配“2.1.1”。仓库的 catalog 已钉 2.4.0（client、server）和 2.1.2（node）。`mcp-host-local` 的实现、测试和成员规格都按 2.4.0。`packages/mcp` 下的三处页面各加了一句注，说明“RFC 行写 2.3.1，实际采用 2.4.0”。本卡让现行规范与实际采用一致，并删去这些注句。

- 本次结果：现行规范（`docs/architecture/technical-foundations.md` 的 MCP 行）写明实际采用的 SDK 版本，RFC-0001 对这一变化有可核对的记录，`packages/mcp` 下的 3 处注句和 1 处图注随之删除。
- 与父卡的关系：本卡是 #1119 W3 波末登记的小卡，只处理版本文字的对齐。MCP 的实现、测试和其余写回由 #1119 及其闭包承担。
- 包含：
  - 把 `docs/architecture/technical-foundations.md` 第 34 行的版本改为实际采用的版本，并核对同一行的 node 适配版本（RFC 与正文写 2.1.1，catalog 是 2.1.2）。
  - 在 RFC-0001 中记录这次版本变化。记录方式见交付条件 D-01，由拥有者先定。
  - 记录里写明：W2 探路结论原在 2.3.1 上得出，现已在 2.4.0 上由 `mcp-host-local` 的测试与对照矩阵重新确认。证据见 I-05。
  - 删去 `packages/mcp/docs/architecture.md` 第 72、623、693 行和 `packages/mcp/README.md` 第 29 行里的“RFC 行写 2.3.1”一类注句，改成直接写现行版本。
- 不含：
  - 改 `pnpm-workspace.yaml` 或任何依赖版本。
  - 改 RFC-0001 的其他条款、status 或 revision 号，除非 D-01 选择新提案。
  - 重跑 MCP 兼容探针。重新确认的证据已存在，见 I-05。
  - 评估是否升级到 2.4.0 之后的版本。
- 类型补充（maintenance）：
  - 应有状态：正文与 catalog 写同一个版本。
  - 受影响消费者：读 `technical-foundations.md` 的设计者，读 `packages/mcp` 页面的实施者。
  - 风险：低。只改文字。风险点是不经提案流程改动已接受 RFC 的决定范围，见 D-01。

## 依据与实施输入

- 现行依据或获准问题：I-01 至 I-06。本卡不沿用父卡的全部范围。

| 输入ID | 唯一源或获准问题 | 精确修订/提交及采用状态 | 本次适用条款或范围 |
| --- | --- | --- | --- |
| I-01 | `docs/rfcs/RFC-0001-technical-foundations.md` | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用（front-matter：revision 4，status accepted，owner PanQiWei） | 第 68 行原文：“官方@modelcontextprotocol/client与server各2.3.1，固定协议线2026-07-28；客户端显式pin该协议，现代stdio服务使用官方serveStdio。仅实际服务端接入需要node适配2.1.1”。第 307 行：“revision 4 方案与接受范围固定。……新增技术决定另开提案。更正和导航维护不能静默扩大采用。”第 291 至 295 行的写回表把“共同技术选择”的规范拥有者定为 `docs/architecture/technical-foundations.md` |
| I-02 | `docs/architecture/technical-foundations.md` 第 34 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | 与 I-01 第 68 行同文，是当前规范 |
| I-03 | `docs/rfcs/README.md`「现行源与维护」；`docs/rfcs/RFC-0002-engineering-toolchain.md` 第 13 行 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | README：“决定后的方案与决定范围固定，必要导航、更正标注和后继关系可维护。”RFC-0002 第 13 行是已有的“更正标注”先例：原文与 status 不变，在开头加标注并写依据 |
| I-04 | `pnpm-workspace.yaml` 第 50 至 52 行；提交 `9bfc876e3` 的提交说明 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | catalog：`@modelcontextprotocol/client` 2.4.0，`@modelcontextprotocol/server` 2.4.0，`@modelcontextprotocol/node` 2.1.2。`9bfc876e3` 说明写“负责人 2026-11-04 明确：MCP SDK 可以用最新版本”和“RFC-0001 r4 仍写 2.3.1：这与负责人的新决定不一致，交 RFC 拥有者更新，本提交不改 RFC”。版本史：`978624857` 钉 2.4.0（参考服务端的依赖要求），`28ca6aaf8` 曾钉回 2.3.1，`9bfc876e3` 改回 2.4.0 |
| I-05 | `packages/mcp/mcp-host-local/SPEC.md`「范围与依据」及「与 SDK 的复用关系」；`packages/mcp/mcp-contract/SPEC.md`「与官方 TypeScript SDK 2.4.0 的对照」；`packages/mcp/mcp-host-local/verification/proofs/sdk/README.md` | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | 成员规格按 2.4.0 引用 SDK。proofs 的版本行：client 与 core 2.4.0，server-everything 2.1.0，Node 26.12.0，运行日期 2026-11-05。另有任务过程材料，观察记录，不是规范：2026-11-05 在 2.4.0 上重跑 6 个目标全部通，其中 server-everything 22 个工具，server-filesystem 14，mcp-server-fetch 1，DeepWiki 3，Context7 2，Microsoft Learn 3（旧修订 2025-06-18）。2026-11-06 对照矩阵 8 行，官方 SDK 客户端 2.4.0 与 `createMcp` 全部 agree，实现提交 `3289bee2f` |
| I-06 | 要删除的注句位置 | 提交 `70615269032b96255dbde69dc679dc4637b90248`，已采用 | `packages/mcp/docs/architecture.md` 第 72 行（“这是 RFC 该行的版本。仓库实际采用 2.4.0……该行的同步归 RFC-0001 的拥有者”）、第 623 行与第 693 行（“RFC 该行写 2.3.1，仓库实际采用 2.4.0”）。`packages/mcp/README.md` 第 29 行图注“RFC 行 2.3.1，实际采用 2.4.0”。全仓 grep `2.3.1` 与 MCP 相关的命中只有 I-01、I-02 和这四处 |

- 实施输入与约束：
  - 现行规范是 I-02。RFC-0001 的方案与决定范围按 I-01 第 307 行和 I-03 固定。所以不能把 RFC 第 68 行直接改写成 2.4.0 而不留记录。
  - 路线按 D-01 已定：RFC-0001 开头加一条更正标注（照 RFC-0002 第 13 行的格式），原文与 status 不变，标注写明负责人 2026-11-04 的决定（提交 `9bfc876e3`）与 2.4.0 上的重新确认证据；现行值写进 `technical-foundations.md`，node 适配同步写 2.1.2（`pnpm-workspace.yaml` 第 50–52 行）。catalog 里没有 server-legacy，正文不提。
- 受影响消费者：读 `technical-foundations.md` 和 `packages/mcp` 页面的人和 agent。`docs/documentation.json` 的登记不受影响，修改后 `check:docs` 须通过。
- 持续成果落点：`docs/architecture/technical-foundations.md`，`docs/rfcs/RFC-0001-technical-foundations.md`（按 D-01 的路线），`packages/mcp/docs/architecture.md`，`packages/mcp/README.md`。
- 可恢复输入：I-01 至 I-04 和 I-06 在仓库中可读。I-05 的两段过程材料只在 #1119 W3 波的本机任务 tmp 中，关键读数已写进上表。接手者以仓库内的成员规格和 proofs 为准，不依赖 tmp。

## 验收与测试

| 判据ID | 依据ID | 成功及禁止结果 | 验证方法与所需证据 |
| --- | --- | --- | --- |
| C1 | I-02、I-04 | `docs/architecture/technical-foundations.md` 的 MCP 行写的 client 与 server 版本，与 `pnpm-workspace.yaml` catalog 一致。node 适配版本按 D-01 的决定处理。禁止：正文版本与 catalog 不同而没有说明。 | 读两处原文并比对。`rg "2\.3\.1" docs packages/mcp` 在 MCP 相关位置无命中，除非是被更正标注引用的历史值 |
| C2 | I-01、I-03 | RFC-0001 对版本变化有记录，记录方式与 D-01 的决定一致。记录写明 W2 探路结论在 2.4.0 上已重新确认，并指向 I-05 的仓库内证据。禁止：不留记录地改写已接受的决定范围。禁止：改 status 或 revision，除非 D-01 选择新提案。 | `git diff` 只涉及 D-01 允许的位置。读 RFC-0001 开头或后继关系一节 |
| C3 | I-06 | `packages/mcp/docs/architecture.md` 与 `packages/mcp/README.md` 中四处注句已删除，原句改成直接写现行版本，没有指向“RFC 同步归小卡”的残句。 | `rg "RFC 该行\|RFC 行" packages/mcp` 无命中。读改后的句子 |
| C4 | I-01 至 I-06 | 文档检查通过。被引用的锚点与链接有效。 | `pnpm run check:docs`。链接检查由该命令覆盖 |

| 测试/验证拥有者 | 类型 | 大致覆盖 | 真实依赖或替身及不覆盖 | 执行入口/所需环境 |
| --- | --- | --- | --- | --- |
| 系统架构（`docs/architecture`）与 RFC 入口（`docs/rfcs`） | 文档检查 | 版本文字一致、链接与登记有效 | 不覆盖 2.4.0 上的运行行为。运行行为由 `mcp-host-local` 的测试与对照矩阵承担，见 I-05 | `pnpm run check:docs` |

- 独立复核与接受：按风险做一次交付边界核对（`review-delivery`）和一次文档评审（`review-docs`）。接受者是 PanQiWei 或其按授权委派者。
- 未覆盖或环境缺口：I-05 的两段重新确认记录在本机任务 tmp，不在仓库。接受时以仓库内的成员规格、proofs 和 catalog 为依据。

## 交付条件

| 条件ID | 类型 | 目标 | 阶段 | 所需结果与判据 | 确认责任及证据入口 | 适用目标 |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | decision | RFC-0001 对版本变化的处理路线 | start | 已定：更正标注。PanQiWei 2026-11-06 在 Claude Code 会话的问题卡片中选「更正标注（推荐）」：RFC-0001 开头加更正标注，原文与 status 不变；现行版本写进 `technical-foundations.md`，node 适配同步写 2.1.2 | PanQiWei。证据入口：本卡发布后的第一条评论转录该回答 | all |

## 当前执行与交接

### 认领与派发

- 认卡声明：未认领
- 派发情况：未派发
- 执行实例：未指定
- 工作树：未创建

### 分支、基线与task context

未登记binding。按 PanQiWei 2026-11-06「做完关卡」，本卡随卡 #1119 的父分支 `PanQiWei/skill-mcp` 交付（#1119 按范式 r3 以父分支加 PR 推进，没有 task context），之后随 #1119 进入联调轨道。写 `docs/architecture` 与 `docs/rfcs` 属于 integration 线的路径，进轨道时 route 用 `cross-track`（`delivery.md` 表外规则 3）。

| 开工读回项 | 实际值/回执 |
| --- | --- |
| 本次直接合入分支全名 | 未派发 |
| 实际开工HEAD | 未派发 |
| 本次读回的目标HEAD | 未派发 |
| task context路径与核验 | 未生成 |

### 当前进展

- 最近更新：2026-11-06，尚未开工。
- 已完成事实与保存位置：事实已在本卡核对。引用的行号取自父分支 `PanQiWei/skill-mcp` 的提交 `70615269032b96255dbde69dc679dc4637b90248`。
- 阻塞与范围变化：无。D-01 已定。
- 下一步及责任：卡 #1119 的执行会话在 W4 期间实施，经 #1119 父分支 `PanQiWei/skill-mcp` 交付，做完后关卡。
- Project对账：待发布后加入 Project 4，Stage 为 Backlog。Wave 与日期字段由 dev-flow 在开工时写入。

### 成果交回

- 固定成果：未交付
- 判据与证据：未交付
- 集成观察：不适用，尚未交付
- 请求接受及剩余责任：未交付

## 决定与剩余责任

- 有效决定：PanQiWei 于 2026-10-25 定“审计与评审带出的改动不并进主线卡，另立小卡”。2026-11-06 PanQiWei 定：发本卡，W4 期间做完关卡；D-01 选更正标注。
- 剩余责任：全部实现与验收，由卡 #1119 的执行会话承担。
- 收尾对账：未接受，保持活动。

本子任务接受不自动接受父交付卡。父子关系不自动成为阻塞条件。
