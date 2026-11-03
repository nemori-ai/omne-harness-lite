# Calendar 公开 API 设计

本页解释 Calendar A1 的公开行为与使用约束。公开值、请求、判别结果和运行时校验由 [calendar-contract 根入口](../../calendar-contract/src/index.ts)唯一拥有，定义索引见[契约公开 API](../../calendar-contract/docs/public-api.md)。本页不维护第二套 TypeScript 签名。行为归 [SPEC](../SPEC.md)，本机工厂依赖归 calendar，SQL 映射归 calendar-local。Schedule 消费公开值和不可变快照，不使 Calendar 依赖 Schedule。

公共服务 DTO 可序列化，不携带 Context、连接、函数或运行时实例。工厂配置、SQL 参加者和取消观察的 signal 不是 wire 请求。跨部署与强保证前提见[安装和部署边界](../../../../docs/package-organization.md#日历与日程的安装和部署边界)。A1 仍为 private `0.0.0` 研发交付，真实跨域联调留待 M2 之后。

## 1. 编码、版本与调用上下文

协议标识为 `omne.calendar-schedule/1`。Calendar 的编码、Owner、可信上下文与错误由 [queries.ts](../../calendar-contract/src/queries.ts)定义，日期、instant 和快照由 [calculation.ts](../../calendar-contract/src/calculation.ts)定义。严格对象拒绝未声明字段，缺失与 null 不混同。LocalDate 采用四位年份 `YYYY-MM-DD`，instant 使用毫秒精度 UTC 文本。UUID 规范、safe integer、文本与时区的具体校验以各公开 schema 为准，不能静默修剪或用默认值掩盖缺失。

可信 host adapter 构造 CalendarCallContext，应用仍检查当前资格。持有服务、知道 ID、可发现工具或曾经有权都不构成许可。Owner 显式区分 tenant 与 system，公共供应使用合法 systemScopeRef，不把它填进 tenantId。originatingSessionRef 只作可空追踪，不引入 Session/Agent 依赖。AbortSignal 只可作为本机观察选项，不进入 DTO、持久操作或 fingerprint。

供应指纹对 `{protocol,operation,owner,aggregateRef,payload,expectedRevision,consentRef}` 的 RFC 8785 JCS UTF-8 字节作 SHA-256。CalendarSupply 的 expectedRevision 与 consentRef 固定为 null。requestId、operationKey、重试次数和运行对象不参与指纹。具体摘要入口归 [supply-application/encoding.ts](../src/supply-application/encoding.ts)。原操作按 owner、operation、aggregateRef、protocol 和 key 寻址，同 key 同指纹认回原结果，异指纹拒绝。sourceFingerprint 与 targetFingerprint 不互换。Calendar 不提供 Job 命令或通用 CommandMeta。

## 日历值与查询

[queries.ts](../../calendar-contract/src/queries.ts)拥有 CalendarQueries、CalendarResolve、CalendarResolution 和分页定义。list 接受目录分页输入，成功值保留 items、nextCursor 和 observedAt。get 接受版本分页输入，versions 本身是分页值。消费者保留 cursor，不把一页当全部目录或完整历史。

resolve 明确指定 selection、version、query。selection 区分 effective 与 explicit，version 区分 latest 与 pinned。query 有 day、count、shift、next、nth 五类，每类结果以 value 包装对应纯计算判别结果。next 的数量在公开 schema 内有界，根 API 不隐含默认数量或版本。transport 如补默认值，须显式投影到合法请求。

list 不要求消费者已经设置日历。effective 读取同一个原子环境 revision 的 timezone/calendar，Calendar 不保存偏好。latest 一次捕获当前 versionId/generation，pinned 不回退新版。CalendarInfo 的 supplyStanding 当前为 null，表示未提供供应健康投影，不能当健康通过。缺环境、无版本、缺覆盖、合法 empty 和提供者故障各自保留。

## 纯计算根入口

[calendar 根入口](../src/index.ts)导出 classifyDay、countWorkingDays、shiftWorkingDays、listWorkingDays、selectNthWorkingDay。输入与结果 schema 归 [calculation.ts](../../calendar-contract/src/calculation.ts)。所有函数只读不可变 snapshot，不访问 Clock、数据库、网络或 Cordis。

| 操作                | 必要行为                                                |
| --- | --- |
| classifyDay         | 按逐日 override 或 weeklyDefault 返回全日日别和命中依据 |
| countWorkingDays    | 统计包含两端的有序闭区间                                |
| shiftWorkingDays    | 正负移位从起始日之外数，零值返回原日                    |
| listWorkingDays     | 严格从 after 之后列出所需工作日                         |
| selectNthWorkingDay | 在明确周期内选择第 N 或最后工作日，合法无位置返回 empty |

非法输入返回 invalid，合法输入缺覆盖返回 coverageInsufficient，搜索预算先耗尽返回 searchLimit。合法推进越过四位日期域时，coverageInsufficient 的 date 为 null，boundary 指明 beforeMinimum 或 afterMaximum。普通缺覆盖仍给出缺失日期。计算依据保留实际版本、覆盖和遍历范围。

## 供应端口与应用服务

[supply.ts](../../calendar-contract/src/supply.ts)唯一拥有 CalendarSupply 及 probe、refresh、importSeed、queryPublication、health 的公开输入和结果。queryPublication 消费完整 address 与 expectedFingerprint，不接受孤立 operationRef。unknown 保持原身份查询，不能换 key 重新发布。普通查询工具不取得供应或发行资格。

[供应应用端口](../src/supply-application/ports.ts)中的 CalendarSourceAdapter 实现 probe/acquire。纯 parser 在 [supply 模块](../src/supply/index.ts)，不在 adapter 上增加 parse 方法。repository 与 persistence 分别负责读取和提交；发布版本、出处、pointer/generation、receipt、outbox 一致提交。Schedule 的版本守卫仍是后续消费义务，不能读取 Calendar 私表代替公共契约。

## 错误与使用边界

精确错误码由公开 schema 拥有。跨范围不存在与无权读取统一 not_found，诊断不泄露其他租户对象。应用查询的 error 与 resolve 内的纯计算失败分别保留，消费者须穷尽 kind，不能把未知分支当成功。重试只允许再观察或按原操作认回。取消观察不回滚已提交事实。

独立宿主可直接调用纯计算，或构造 createCalendarQueries 和 createCalendarSupplyApplication。构造依赖是本机端口，不是远程 DTO。纯计算、独立查询无需供应运行器或 Cordis。SQL 前提见[持久化与实际限制](internals.md#持久化与实际限制)。

## Cordis 与独立工具

采用 Cordis 4.0.4 与 [IC 约定](../../../../docs/architecture/cordis-integration-conventions.md)。calendar-contract 和 calendar 不导入 Cordis。服务定义唯一归 [calendar-cordis-contract 的 ./cordis](../../calendar-cordis-contract/docs/cordis.md)，查询与供应键分别为 calendarQuery 和 calendarSupply。定义不授执行资格，提供者继承定义并保管资源，不能把资源建在 caller ctx 上。

[calendar-tools](../../calendar-tools/docs/public-api.md)贡献 list/get/effective/resolve，唯一动作能力为 calendar.read。它消费 Calendar 定义及 Tool 公开作者协议，不依赖 calendar 实现或 calendar-local。插件 inject calendarQueryKey、toolBindingsKey、toolGenerationsKey。createCalendarToolEnvironment 从每次 CallAccess 解析可信上下文，模型不能自报 tenant、actor、authContext、SQL、种子或任意 callback。

工具把完整判别结果、错误和依据交给 ToolOutputCustody/Offloader。Calendar 不自造 detailRef/truncated 字段或详情存储。超过 16 MiB 编码预算明确失败，不返回裁剪成功。分页保留 nextCursor，分页不等于任意裁剪。长结果的保管、offload 与按当前资格读回由 Tool 拥有者承担。

依赖变化先停止新准入，未完调用按原身份排空或保管。dispose 只撤自己的 token、listener、timer、句柄和使用权。其完成不证明发布、网络效果或通知撤销。细节见[流程](key-flows.md)与[本地绑定](../../calendar-local/docs/cordis.md)。

## 应用工厂与供应数据约束

createCalendarApplication 接受 repository、persistence、queries、supply，返回查询与供应应用。queries 和 supply 分别补充各自所需端口，真实构造类型由根入口导出的 `src/application.ts` 拥有。独立查询仍可使用 createCalendarQueries。供应运行器、Tool 和 Cordis 各自装配，缺供应网络不阻止已有覆盖内查询。

快照 weeklyDefault 恰好七项，按周一至周日解释。overrides 按 LocalDate 唯一。coverage 两端包含，范围连续可解释。contentHash 标识规范内容，原材料独立 hash。knowledgeAsOf 不取观测时间替代。provenanceRefs 是来源 authority 引用，本机 rawReference 由供应材料保管。发布版本精确关联原 candidate，不能用后来的 noChange 回执替代其材料。材料缺失、不匹配或资格不足明确失败。

发布按 expectedGeneration 复核当前依据；相同内容 noChange，异内容同 version 拒绝。withheld/rejected 候选和失败证据持续保留，不列为已发布版本。提交后反应失败只恢复 outbox，不重铸版本。来源政策、种子与实际存储限制见[内部设计](internals.md)。
