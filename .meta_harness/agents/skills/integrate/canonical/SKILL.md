---
name: integrate
description: >
  唯一 Reduce 的持续收件、接管、跨域集成、八类监督、整体验证及逐波 release。处理 ready/blocked/failed 或恢复里程碑 reduce 时加载。建卡及首次消息用 dispatch。
---

# 集成

首次和恢复先读 `docs/engineering/integration.md`「集成节点的清单」及 `docs/engineering/map-reduce-states.md` 全部 Reduce 状态、请求处理机、全局优先级和组合不变量。先从持久回执确定 phase/control、owner/epoch、当前 F/roster、signalQueue、pendingOps 与每件请求状态。不能按会话记忆认定成功。工程规则、接受与权限沿 integration/delivery，不在本技能另授权限。

## 阶段、动作和完成事实

| 阶段及规则 | 输入与允许动作 | guard、输出读回和下一等待 | 失败去向 |
| --- | --- | --- | --- |
| PREPARE，R01/R02 | 已接受目标、当前正式波、F、权限、两宿主策略、实际 roster 和期限；按 dispatch 准备输入 | 输入齐备到 DISPATCH，缺口先自主消解，必要决定过三问 | 依赖动作冻结，其他工作继续 |
| DISPATCH，R03 | binding、线包、首次消息、已验证运行 recipe；启动接收监督 | 分别记录生成/校验/打开/人工转发/认领事实；监督已挂后到 SERVE | 展示 queued 不算打开；派发未知先恢复，不重复执行 |
| SERVE，R04–R06 | 完整分页收件和持久积压；next 发现 ready/blocked/failed；claim 读回后单写处理 | 请求处理机记录身份/head/base/证据；WaveReady 全满足才到 VERIFY_WAVE；队列空则 supervise | 非成功立即接管并处置；只解决一项不丢其他信号 |
| VERIFY_WAVE，R07/R08 | 全部预期项有效解决、最终候选和适用验证/评审 | 整体通过并绑定当前 head/F 到 RELEASE_WAVE | 新 head/失败回 SERVE，不能沿旧证据接受 |
| RELEASE_WAVE，R09–R13 | 调整后一波预案、正式物化后继、全部存续线 delta、接受定位 | 严格按下节顺序读回，release 与 close 均确认后继续 SERVE 或 FINALIZE | 任一缺项不接受；未知先恢复，候选变化退回适用阶段 |
| FINALIZE，R14/R15 | 明确 terminal、最终报告与剩余责任 | 必要接受及清理条件读回后 DONE | 未齐继续等待，不用空队列代表完成 |
| DONE，R16 | 重放或新输入 | 只返回原终态；新任务需新授权 | 不隐式重开 |

## 逐件请求处理

按状态正文请求处理机逐件执行：发现并验证来源，按 owner/epoch/预期序号 claim，读回写权后建 reduce 隔离候选，串行同步/修复/迁移，验证与评审，发布精确 gate，读回实际合入并 record。保存原始 head、reduce 候选 head、targetBase、merge SHA 和每次证据。处理 A 期间 B 与其他监督信号持续落盘。

| 请求 step | 允许动作、guard 与出口读回 | 失败/等待 |
| --- | --- | --- |
| QUEUED | 验证登记来源、输入和 outcome；ready 前置齐备才 claim，非成功进入 BLOCKED 接管 | 不完整读取明确报错，不能当空队列 |
| CLAIMING | 持久 claim 并读回 owner/epoch/序号才进入 PREPARING | 未读回不写候选；未知 RECOVER |
| PREPARING | 持有唯一写权，在最新 targetBase 形成候选，处理冲突和迁移并记录 candidateHead | 操作明确失败处置；未知恢复，外来 head 冻结 |
| VALIDATING | 检查/评审绑定 candidateHead/targetBase，齐备才发 gate | 失败回 PREPARING；修改后受影响证据重验 |
| WAIT_GATE | 保存精确 run/attempt，持续监督审批和其他请求 | 失败/取消由 reduce 处置；需要权限交有权者，不自动批准 |
| READBACK | PR 实际合并、mergeCommit 在目标可达且头链吻合才记 MERGED | 明确未合入到 BLOCKED；未知 RECOVER |
| MERGED | 保存回执，继续监测有效性 | 回退/事实失效到 REVERTED 并使 WaveReady=false |
| BLOCKED | 保存原因、冻结对象及剩余责任，执行有效 takeover/rescope/redispatch | 解除后回适用 step；不能直接跳 merged，其他请求继续 |
| SUPERSEDED | 读回明确取消/替代及剩余责任 | 不算成功或自动满足 WaveReady |
| REVERTED | 保留原 merge 历史，形成新候选后回 PREPARING | 不复用旧证据或删除历史 |

Reduce 负责交出后的全部冲突、全局设计、跨域修改、消费者迁移和改后验证，不将集成缺陷作为普通 line-return 退回。外来 head、目标 base 变化和回退令受影响验证失效。Action 成功、PR 关闭和审批完成均不能单独记录 merged。gate 审批仍要求既有权限，工具不自动批准或扩大授权。

blocked/failed 立即核对停写、成果与剩余责任。发布并读回有效 disposition：takeover 自己完成；rescope 取得有权决定并说明后续责任；redispatch 先解除阻塞、确认旧执行终止和写权交接，再授权新 attempt 与完整输入。发布处置不等于 resolved，同波重派仍须实际完成后才能收口。Line 不必等 R 关闭才接收有效重派。

## 波末与滚动规划

只正式维持当前波与 R(w)，后一波保留可调整预案，更远只留依赖路线图。固定接受顺序：

1. 验证当前成果并确定 F，按实际结果调整后一波预案。
2. 创建并读回下一波全部任务与真实 R(w+1)，保持其依赖 R(w) 的放行。
3. 给全部存续线含 idle 发布并读回 delta，引用同一计划修订/F；terminal 明确决定。
4. 核对下一输入、任务/验收、消费者迁移、策略和等待链齐备，才由有权者接受并读回 R(w)。
5. 发布并读回最终 ReleaseRecord，最后关闭并读回 R(w)。

缺后继、缺任一 delta、未解决请求、旧修订或未知写入都拒绝接受/放行。未知建卡/发布/close 先以原 operationId 对账，不重复制造副作用。单卡接受不唤醒 Line；全部存续线逐 reduce 消费，idle 继续订阅，只有明确 terminal 才结束。

## 等待监督与提问

按 integration「等待监督」同时覆盖八类：交接积压、申请 Action、候选/轨道、发布审批合入、自有代理/检查、接收监督基础设施、预期项期限、收口后继。phase 决定活动对象集合。先挂事件边界再有界对账，先处理持久积压再 sleep。处理一项时不能丢其他事件。只读 next 的等待必须纳入 supervise 任一事件选择。

本机健康每 5 秒；业务变化以事件驱动，仅已登记活动 run/审批有界轮询。期限由本波输入明确给出，不猜 Line 死亡。不监视外部 Line 思考、普通评论或波中心跳。父 tool-session 观察监督器自身，权限/连接/游标/日志错误明确进入恢复。可行动信号不是验证通过或整波完成。

向人提任何方案问题前完成三问：里程碑必要性、方案复杂度、自主可决策性。先删过度设计、简化、核对已有授权/架构/领域/需求/相邻机制。仍有真实目标冲突、权限缺口或必要未知才给人最小选项、推荐、后果和证据。其余自行决定并留简短依据。

## 恢复与运行入口

RC01–RC09 和全局 G00–G06 优先于正常阶段。未知副作用、写权冲突、基础设施故障进入 RECOVER，保留 pendingOps、接收游标、处置位置和 resumePoint。先读回外部实际事实再恢复阶段，旧执行未终止不得切新 epoch。STOPPED 与 DONE 分开；明确恢复授权后才能重启。重复 operation 返回原结果，同键异文拒绝。

固定工具使用 `pnpm run reduce next|claim|record|prepare|check-release|release|supervise|ack --input /absolute/input.json`，每次只选择一个操作。版本 3 安装、输入字段与退出码从 `tools/dev-flow/src/delivery/README.md` 和已采用版本帮助取得，由本波运行绑定提供。supervise 返回后先处置信号，再用 ack 记录处置证据并恢复原监督；返回不自动消费或放行。该输入必须包含 repo、owner/epoch、operation/journal、活动对象、期限、事件文件及原 shell 续接方式；缺入口就是开工缺口，不能发明旗标。申请与 watch/inbox 的既有入口见 line 的 `references/runtime.md`。每次状态推进保存命令、退出码和读回，未执行范围明确报告。
