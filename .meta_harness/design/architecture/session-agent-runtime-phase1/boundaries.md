# 责任、包拥有者与迁移

长期Session／Run事实不在Agent对象中保存。协调者读完整事实和当下条件，纯Loop决定下一步；模型／工具独立执行、结算并持久交回。所有数据边界显式租户与可信主体，scope与isolate只管集成。

## 最小拥有者映射

候选名字是建设坐标，未取得实施采用前不创建workspace成员。

| 责任 | 定义拥有者／未来正文 | 提供／消费者 | 模板与处理 |
|---|---|---|---|
| 会话数据、受理与Run协调、可查询恢复义务 | 新`packages/core/session-runtime`：公开类型／SPEC；纯端口含共同事务参加能力及会话服务 | 新`packages/session/session-runtime-local`；用户入口、Agent执行驱动、恢复调度 | definition service-contract；provider service-provider。一个协调服务和内部事务端口，避免每张卡一个包 |
| 通用日志与明确事实／消息封装 | 现`packages/core/session-log`公开类型＋SPEC；精确SL3承诺逐项迁入 | 新`packages/session/session-log-sql`；Session协调、context、模型／工具journal适配 | service-contract／service-provider；替换非正式JSONL，使用AtomicStorage。定义不importSQL实现 |
| 模型消息选择与前缀缓存算法 | 新`packages/core/model-message-projection`公开冷建／materialize纯函数与显式CacheOwner增量函数／SPEC | Session协调和Agent；模型runtime只消费固定messages | module；算法无Cordis／存储／供应方依赖。缓存资源属于会话数据提供者，不由模型执行方决定Run语义 |
| 下一步方程与执行一段 | 新`packages/core/agent-loop`公开纯nextStep与注入依赖的driveStep／SPEC | Session provider持有每attempt执行资源；框架用户可直接取用函数 | module；不另造公共AgentRuntimeService空层。会话驱动插件是provider内部fiber |
| 模型实际调用 | 现core/model-request-runtime公开函数＋完整操作接口／./cordis；旧能力精确有效源 | 现model/model-request-runtime-local；Session/Agent及其他框架消费者 | 保留独立模型执行；更正attempt来源／准入证明，服务定义不在provider重复 |
| 工具实际调用与拓展 | 现core/tool-execution-runtime、loop-extension-runner | 现提供者；Agent驱动 | 保持原效果／结算义务，补原等待消费位置而不重写工具协议 |
| runtime context | 现core/runtime-context RC-1～14与session/runtime-context-local SPEC | Agent、模型组装和工具reader | 仅复用其已接受范围；SQLjournal须兼容原回放、未知append、来源代际与同步撤准入。不得宣称外部source纳入同事务 |
| 授权、定义、装配、模型配置与凭据 | identity、agent-definition、assembly-manifest、model-profile-directory等实际定义入口 | 已有提供者或明确未实现部分；Session创建与每次准入 | 名字不代表能力完整；首卡装配必须取得真实版本和当前主体，不在demo硬编码 |

模型/工具服务留在进程执行池；Session协调是持久工作责任拥有者，Agent fiber仅持原调用句柄。
存储参加端口与会话行为在同一Session定义包维护，当前没有第二个独立消费者证明值得新建session-state包。

## 日志职责拆分

`LogEntry`外壳由通用日志拥有：租户、会话、顺序、稳定去重、可校验类型与载荷。
显式联合区分message、session事实、runtime-context事实、model/tool调用事实；各payload由其语义拥有者定义。
未知的无关追加保留并跳过；自称归某拥有者但格式无效的条目返回数据不可用，不能静默当未知。
messages定义保留合法业务SystemReminderMessage，移除AttemptStartedSource。非消息attempt字段属于Session事实。
模型codec只定义原调用准备、传输和结算，不定义所有Session日志或建立Run。

## 真实消费者迁移

| 当前消费者 | 问题／动作 | 完成条件 |
|---|---|---|
| demo-agent-tool-loop bootstrap／tool-turn-driver | 用prepareModelLogEntry记录attempt reminder并伪造完整Session协调 | 正式入口转Session API；删除被替代运行／日志装配路径，不保留兼容函数；示例改为公开核心函数或正式服务的消费者 |
| demo model-request-text messagePrefixWithSources | 每个assistant回扫prefix查原response，最坏二次；尝试提醒充当开始标记 | 改投影公开函数；原响应按索引lookup一次；non-message不入messages；示例不得独占正式算法 |
| model-request-runtime-local settlement-prefix | 从SystemReminder source读取attempt合法性 | 注入已定义Session事实／原准入证明来源；模型不负责创建／恢复Run，原迟到结算不被新栅栏拒绝 |
| pi-ai-transport plan | reminder被编码成模型role／marker | 它只编码合法message；删除attempt variant后负类型及运行时检查拒绝内部事实，而非特殊字符串过滤 |
| core/messages与相应旧Schema／tests | attempt_started加入EventReminderSource | 破坏性移除并同步所有消费者／schema／范例；冻结旧源通过明确新接受切换，不就地改冻结契约 |
| runtime-context-local与tool／model journal消费者 | 依赖通用append／read及真实回放 | 替换日志后跑原合规及unknown-append／drain验收；普通append保持独立提交，显式参加操作另有StorageUnit入口 |
| session-tenancy-table／session-log-jsonl | 用户明确非正式Session基线 | 归属写入会话创建同提交；SQL日志替换。消费者清零并验证后删除旧提供者；没有回填／兼容期 |

实际源码依赖和模板读数是派生证据，不在此维护第二份代码图。所有受影响直接／间接消费者及旧承诺切换记录由实施增量更新，不因本表列出而称迁移完成。

## 未知边界的限定处置

不新增inbound／queue对象；用Session事实与关系实现资格。context block对象性、附件对象性、通知投递、dispatch成本等待裁保持原入口；首卡明文无工具不依赖它们。
模型response原件与adoption记录保持分开，不替待裁选择合并。所有opaque身份按已有公开类型，未接受新格式。
SYS全局SLA没有数值，本设计只声明进展前提，不承诺恢复时限。未来分布式由各端口明确传输身份／持久ACK，不改变Run语义。

## 质量属性场景

前六项质量场景，重要性均高，难度高者优先；同档先验证会造成丢事实或重复外部效果的风险，再看性能。Q7～8补装配与演进，不以复杂度换安全。

| # | 属性 | 刺激源 | 刺激 | 环境 | 制品 | 响应 | 响应度量 | 重要性／难度 |
|---|---|---|---|---|---|---|---|---|
| Q1 | 可靠性 | 发送者 | 受理提交时停机／丢回执 | 会话可接收 | 受理事实与资格 | 全提交或全不提交，重复可查原身份 | 成功受理漏项0；重复承接0 | 高／高 |
| Q2 | 安全性 | 新旧推进者 | 同时收尾、输入、取消 | 原Run未终结 | 共同存储／栅栏 | 唯一决定，旧推进拒绝，迟到结算保留 | 同Session双未终结0；越权新调用0 | 高／高 |
| Q3 | 连续性 | 运维／依赖换代 | 替换Agent／注入提供者 | 原模型／工具仍实际运行 | 原调用与持久等待位置 | 交还并接续原调用，不重发 | 原callId不变；同义重发0 | 高／高 |
| Q4 | 隔离 | A会话贡献者 | 注册、故障、撤除 | A/B和两租户同时存在 | 会话动态插件与数据边界 | B不见A贡献、不受A撤除，数据授权显式 | 串会话贡献0、跨租户读取0 | 高／高 |
| Q5 | 恢复 | 系统恢复 | 无Agent实例、通知丢失 | 已受理输入／取消／失联调用 | 持久恢复索引与协调 | 公平扫描继续责任，不依赖新边沿或查看 | 可推进项最终被检查；未满足等待空attempt0 | 高／高 |
| Q6 | 性能与一致 | 调模型者 | 长历史、追加压缩、规则变化 | 冷／热缓存 | 模型消息投影 | 同完整输入一致，非消息不入模型，无反复扫前缀 | 冷O(N)、定位O(1)期望或O(log N)、输出O(K+B)另计 | 高／高 |
| Q7 | 可演化 | 提供者维护者 | 更换存储或执行后端 | 单机第一版 | 纯接口和绑定 | 数据语义保持，机制可替换 | root无Cordis依赖；消费者不import提供者内部 | 高／中 |
| Q8 | 可观测 | 运维 | 存储未知、停止未完成 | 故障持续 | 失败／停止／恢复状态 | 不假成功，未完成责任可查 | 失败包含原身份和阶段；无秘密日志 | 高／中 |

没有已接受响应时限、扫描间隔、缓存预算或重试次数。它们是有界配置／策略输入，构建时验证，不写死为产品政策。
