# 已提交求值的读取链候选

本增量不修改 revision 2 的适配设计正文。来源是用户确认的完整模型请求交付、真实依赖与显式策略要求；技术选择由主线在实施委托范围内提出，尚待独立架构与规格评审。它不接受完整 Agent 定义或 Agent Loop。

## 缺口与候选

已接受 asset-evaluation/v3 的根不进入 composition，也没有根正文属性输入；assembly-manifest/v2 没有读取已提交求值的操作。模型运行时需要每次发出前读取两个时限及可选模型锁。直接读取固定配置不能兑现这项承诺。

| 候选 | 责任与代价 |
|---|---|
| A：先定义完整 PF-004 正文 | 一次完成主从、协作、角色与全部装配字段；范围超出模型请求纵线，依赖更多产品决策，延迟本次交付 |
| B：窄正文投影与已提交结果读取 | 定义 references/attributes 的精确读取面；由真实资产版本读取、求值、提交及 readEvaluation 串起。需要五份契约显式演进，但不发明完整正文 |
| C：调用方直接交运行时固定设置 | 实现最短；绕过现有 S-21 的现读语义，需改变产品承诺，并使根资产换版无法影响下一次发出 |

主线推荐 B。完整正文的后续字段仍归 PF-004；不得把这次窄投影当成完整定义支持。

## 字段与责任账本

| 家 | 精确新增承诺 | 不由此推断 |
|---|---|---|
| data.agent-definition/v1 | 对同一不可变 AssetVersion 的正文读取 references、attributes；三个项为 first_token_wait_limit、post_first_token_stall_limit、model；取值域与作者默认值在这里定义 | 不定义新的身份对象；其他正文无损保留；缺项不补值 |
| capability.asset-evaluation/v4 | root.attributes/source 对齐实际根版本；根设置沿原层序及锁规则进入 values，根不进入 composition | 缺项可以求值成功，运行时现读时拒绝缺失时限；不选择初始模型 |
| capability.asset-registry/v3 | fill/reload 明确收 compositionOrder；成功求值后的全排列验证与目标表、清单同次提交；content 恰为 evaluation/compositionOrder/filledBy | registry 不偷做求值；reuse 保留原求值源与相对顺序 |
| capability.assembly-manifest/v3 | readEvaluation 固定当前头上界，按本会话提交序号选最近 given/mint 源；返回已提交 evaluation 与 compositionOrder | reuse 保留每表旧来源但不回退已提交根求值；最近源畸形不跳过；此读面不提供当前层配值 |
| capability.model-request-runtime/v3 | S-66 显式 currentEvaluationInputs 端口提供真实一致的 EvaluationInput，公开 evaluate 后取当前设置；新调用 fresh model 判锁，每次 dispatch fresh 两时限；不可读/非法/缺时限拒绝发出 | 新会话初选仍是装配显式 selectModel 的真实记录，不猜第一条目录或最新模型 |

时限数值、缓存 TTL、超时、限流、队列和诊断边界由装配提供显式配置。时限域为正 Duration，模型域为精确 RouteName。字段名是已有“用哪个模型”及调用时限规则的技术投影，不能增设默认产品政策。

## 存储与单机投影约束

正文源由资产读取提供者返回实际资产与版本。求值是公开纯函数；注册表提交的是它真实产生的结果。清单及 registry 目标表的同提交要求沿已接受实现映射，由 SQL 的 assembly_manifest_record(session,seq) 及其同事务表内容承担，owned_ref 唯一约束处理跨会话求值引用冲突。会话 JSONL 另承接 runtime 的调用锚点及响应体/回复同批追加；本链没有清单 SQL 与会话 JSONL 的跨对象原子承诺。runtime 从已提交清单内容读取，不消费未提交的临时内存值。

尝试归属仍由已有 session/run/attempt 栅栏校验。独立验收应用可以作为当前尝试内部调用者消费 registry 与 runtime；它不取得整个 Agent Loop 的业务所有权。中心/据点复制协议与正文初值生产者的完整产品缺口保留。

## 需要独立判断的反向核对

- 窄正文能否完整承载当前时限和模型锁，未知字段是否被错误地拒绝或丢弃。
- 新的读取链是否每条边都有精确契约，是否存在 data 到能力的反向循环。
- reuse 是否保留每表原求值来源；全会话已提交根求值是否错误回退；当前设置是否被历史值替代。
- 同提交是否实际落在同一存储对象，失败和恢复是否有明确 owner。
- 缺时限是否真正零出网；资产换版是否只影响之后发出，已发出绑定是否保持不变。

候选成稿、Schema 或有限模型检查不关闭真实读取、存储与恢复义务。技术接受、提供者采用与总体交付验收分别记录。

2026-09-27 来源核对修正：先前草稿把清单也指定为会话 JSONL，超出了实际契约且与旧已接受 provider 冲突。主线按共享存储对象的真实归属修正；不为新读取操作改动旧四操作或制造跨日志事务。

## 2026-09-27 实时输入补充裁定

独立架构复审找到两种承载反例：E2之后收窄旧表reuse(E1)导致根值回退；本机层配值已改变但无reload时读取历史E1不能现算。前者由manifest最近已提交源派生解决，不修改表自身basedOn。后者必须由真实输入读取与公开evaluate承担，不能借中心同步/完整AgentLoop缺口延期。

备选：沿历史值不成立；每次请求向中心查询违背捕获成员资格边界；本机一致输入端口加公开纯evaluate可同时保留当前值与自主组件。选择后者，代价为实际读取及一致性验证成本。

候选runtime S-66定义显式 currentEvaluationInputs.read(session,tenant)。输入提供者从自己的真实持久事实读取完整配方，不能从EffectiveAssembly.values反推；standing沿会话创建捕获，不逐请求取中心当前成员资格。持有和配值取本机当前权威/已读到副本，根source及references/attributes取本次选定不可变资产版本实际正文，满足AE4 C16/PRE-9；不能伪改版本号或把current持有偷偷改pinned来维持旧根。完整读取须一致快照或显式有效性核对，判不出即unavailable。

具体单机源节点为packages/assets/evaluation-input-store，独立验收装配为apps/model-request-acceptance。源提供者持有捕获成员资格、session/workspace/root配方和本机资产/持有/配值的真实存取；runtime持有何时读取与纯evaluate、失败零出网。装配显式发布初始根资产与初选记录；完整治理UI及同步协议不在本纵线。

新调用的effectiveModel/basis/合法目标使用新鲜model；已openCall的档案与adaptation沿S-7保持固定，之后组织改锁不会重写它。每次dispatch另求新鲜两个时限。这两个时点不合并为“每发出重选模型”。原effectiveModel到openCall的选择竞争窗口保持，不造新的stale-basis错误。

验收必须包括无reload层配值变更、新call受新锁而旧call仍固定、根版本/声明不一致、输入读取竞争、跨tenant及缺时限零HTTP。提供者待成稿，口头方向与历史有限检查不构成闭合。
