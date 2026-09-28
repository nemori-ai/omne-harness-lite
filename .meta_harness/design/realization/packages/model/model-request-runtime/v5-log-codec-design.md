# model-request-runtime：MR5 日志 codec 显式消费增补

2026-09-28，rev 1，candidate，未接受、未实现、新 bindings 0。本页只接续 D-088 的共同 codec 与 D-090 已接受的 MR5/RT5；不新增领域对象、服务操作、日志操作、存储表或 Cordis fiber。原 v4-log-codec-design.md、根入口与历史 mrr/1 均保留各自的精确消费关系。

## 输入与责任

- [D-088](../../../../record/decisions/model-runtime-log-codec-adoption/decision.md) 与 [v4-log-codec-design](v4-log-codec-design.md) 继续拥有共同键、捕获、关联、完整批和 G29-P 前提。
- [D-090](../../../../record/decisions/model-headers-v5-adoption/decision.md) 接受 [MR5](../../../../spec/data/model-response/v5/contract.md) / [RT5](../../../../spec/capabilities/model-request-runtime/v5/contract.md)。本次仅将 MR5 的完整表示接收接到 codec；尤其 rawHeaders 保留字符串或有序字符串数组，缺席与空 map 不合并。
- MS4、CA2、SL3 和 D-087 结算投影没有因此换版。codec 不获得日志权限，不决定调用收场、不发送 HTTP、不判 Run 终结、不校验凭据来源。
- core/model-response/v5 已提供明确公开接收器；codec 消费该公开入口，不私导 core 源码。布尔 judge 不制造 owned value，仍先捕获自有 JSON，再完整接收。

## 公开入口与格式

新增显式公开 subpath `@omne-harness-lite/model-request-runtime/log-codec/v2`，函数名和参数责任沿已有 log-codec；现有根入口继续按 MR4/mrr/1 行为；基线没有 `/log-codec` 子路径，本次不添加该兼容面。新入口只有明确消费者采用后才使用，包存在不自动切换旧写方。

| 边界 | 精确行为 |
| --- | --- |
| 新值捕获 | record/message 沿已有 MS4；response 以 MR5 完整接收，自有值保留所有成员。写入格式为 mrr/2 |
| 新写入 | wrapper 恰 `{format:"mrr/2",category,value}`；全部类别都使用 mrr/2，不把一批消息与响应分别随意选格式 |
| 新历史读取 | mrr/1 按 MR4、mrr/2 按 MR5 完整接收，保留实际原 format 与原值，不把旧数组头当 MR5 重解释；未知 format 不认证 |
| 旧入口 | 仍只接收 mrr/1/MR4，不因新模块装载接受 mrr/2 或 MR5-only value；不得借新捕获对象绕过旧接收边界 |
| 键 | 继续使用 D-088 的 **mrr/1 技术键命名空间**和全部 parts 规则。payload 格式版本与键版本是两个内部常量；不能全局替换旧 modelLogFormat 来升级 |

同一 ResponseId/MessageId 不因 payload 格式变更产生第二个 dedupeKey。新旧写方仍由 SL3 的同一本 entries.jsonl 和既有判重约束竞争；没有跨格式别名、双写、第二条费用账或私有 ID 后缀。

## 捕获与共同算法

值捕获、wrapper inspect、prepare 和完整批认回各有明确版本域。可以内部复用一个核心实现并注入固定表示接收器及格式集合；配置只由两个模块内固定声明持有，不增加让调用者任意注入 judge/格式的公开工厂。

每个不可伪造捕获必须保留其表示/格式域。新写方仅准备符合 MR5/mrr/2 的候选；旧写方收到新捕获必须拒绝，或者对同一自有原值重新执行旧完整 MR4 接收后才允许旧写入，不能单凭共享 CapturedValue brand 放行。历史读取捕获不得自动成为新写候选；只有显式新捕获原值并通过新完整接收才可准备。认回返回实际原 wrapper、位置及完整值，不重新序列化或用候选覆盖已提交原值。

inspect 从已接收 wrapper 的**实际格式域**重建值及 D/R；不能借“新 prepare 总写 mrr/2”反向否定合法 mrr/1 历史条目。MR4 无法表示的数组头不得被旧 writer 写成 mrr/1。构造壳、键集合精确性、身份关联、opened 时刻、完整消息前缀、参数留痕、金额、成员顺序、相邻及原批优先均复用 D-088 一份算法，不创建第二套结算规则。

原 `[M,R]` 一次 append、G29-P 的所有写方迁移及物理同批前提继续存在。格式合法、相邻和成员数都不能证明实际同一次物理提交。新 codec 只接收完整事实，日志权限、unknown/旧任务静止和实际认回仍由原 owner 兑现。

## Cordis 与生命周期

这些入口是同步独立函数闭包，没有 plugin、service、fiber、effect、事件或 inject 边。MR5 值接收不使 runtime 调用重启或重发。一次捕获的域与自有值固定；后续贡献热更不切换其表示。自有值只有普通内存寿命，不新建后台缓存。

升级先发布新入口，再由 runtime/app/其他写方精确采用；已在途旧调用按其旧代码/值排空，不将旧 opaque 对象塞给新实例。旧历史不迁移、不改写；没有不中断升级承诺。全部真实写方尚未迁移时不得宣布完整 MR5 耐久链通过。

## 验证义务与缺口

| ID | 可失败断言与范围 |
| --- | --- |
| LC5-V1 | 明确新入口接受 MR5 全值和数组头并写 mrr/2；无损数、数组次序、缺席/空 map 和自有快照保留；已冻结根/旧入口行为回归 |
| LC5-V2 | 公包负控：v2 的 MR5-only capture 不能经旧 prepare/settlement 写为 mrr/1；反射构造和伪造 capture 仍拒；历史捕获不自动获新写资格 |
| LC5-V3 | 实际 mrr/1 + mrr/2 混合前缀，新 read/inspect/原批认回逐域判断；未知 format、mrr/1 数组头、错 key/shell/关联不可认证；不滤字段、不补默认 |
| LC5-V4 | 新旧格式同 ResponseId/MessageId 的 D 相等，实际 SL3 并发 append 只有先到者完整成立，无第二条账；读回完整原值，不拿败方 format/候选消息身份否定先到批 |
| LC5-V5 | 真实 JSONL `[M,R]`、正常 close/reopen 后数组头及费用认回；opened 与 durable firstTokenAt 逐值相同；该场景仍显式承担 D-088 G29-P 前提 |
| LC5-V6 | 本包实际 build/type/test、受影响规则、公开制品新旧两入口与 README/README_ZH 示例；来源版本、命令、失败及未测范围可查 |

新增 bindings 为 0，尚未运行上述义务。不将已有 MR4 codec 测试或 core MR5 纯值通过补成 LC5 pass。实际 transport/runtime 头交接、来源脱敏、权限、全部十三操作和 37 模型认证由各原 owner 接续；不作为本页的新隐式保证。

本页候选需独立架构/表达核对和精确技术采用后才可实施。具体内部文件组织允许选择；键命名空间、格式接收域、旧入口行为和完整批规则不得由实施者自由替换。
