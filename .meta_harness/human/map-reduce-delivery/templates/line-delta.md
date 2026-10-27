# line-delta 模板

Reduce 在本波接受之前发布并读回每条存续线的 delta，包含 idle。机器记录由共享 schema 和正式 delta 命令生成，本模板是人读信息清单，不是替代编码。marker 只负责发现，授权、序号、前项和摘要仍须正式校验。规则归[集成清单](../../../../docs/engineering/integration.md#接受与逐收口续接)。

## 身份与读回

- <repo、milestone、wave、line parent、计划修订、稳定 operationId>
- <预期序号、前项引用、正式记录 ID/摘要、发布/恢复 journal 和读回证据>
- <原候选 head、reduce 最终候选、targetBase、merge SHA、最终 F>

## 本波变化

- 原候选到最终候选：<具体改动、原因、验证与评审证据>
- 外域及共享冻结物变化：<公开契约、拥有者和精确修订>
- 消费者迁移：<已完成迁移、Line 下一波需采用内容与剩余责任>
- 非成功处置：<requestId/旧 attempt、takeover/redispatch/rescope 决定及读回，不作为普通返工指令>

## 下一正式决定与队列

| 字段 | 内容 |
| --- | --- |
| continuation | <active/idle/terminal，依据与有效决定> |
| 新正式波、计划修订与最终 F | <精确值> |
| 下一任务和验收 | <已建卡、顺序、目标/非目标、已接受输入、binding/写范围引用> |
| idle | <原因、相关变化；不建虚假任务/PR> |
| terminal | <明确决定、最终交接及剩余责任；不以空队列推断> |
| 工具、技能与两宿主策略 | <固定版本、采用变更及当前宿主解析结果> |
| 真实直接后继 R | <非终态必须存在；可选未知 nextHint 不是终态> |
| 等待与恢复 | <watch 入口、事件文件、journal、游标及原 shell 续接> |

## 消费与下一等待

Line 只在边界按连续序号消费，写 state 并读回。active 从最终 F 建新分支，不重放旧补丁；idle 保存原因并立即续挂下一真实 R；terminal 最终交接。每个收口均处理，不能跳到远期有任务的波。单卡交回/接受、普通评论和 PR 合入不触发消费。缺号、异文、分页不足、缺后继或摘要矛盾均失败并恢复，不取最新记录掩盖冲突。
