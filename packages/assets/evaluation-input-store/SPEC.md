# 本地求值输入提供者

本包实现本机 SQLite 输入来源。共享类型和求值承诺归 [asset-evaluation](../../core/asset-evaluation/SPEC.md)，正文提取归 [agent-definition](../../core/agent-definition/SPEC.md)。本页约束来源、发布、读取和资源撤除；不授予调用权限，不交付完整 Session、Agent 或资产治理产品。

## 来源与装配

- 只使用本 `storeKey` 的真实发布、实际会话租户映射和当前组织治理公开事实。调用方不能用完整预造输入、历史求值结果、恒真资格回调或 `EffectiveAssembly` 代替来源。隔离标签及 tenant/session 参数不构成授权；可信宿主向已获权限的消费者分发闭包。
- EIS 与治理资格使用同一 `AtomicStorage` 对象，治理通过公开 `participate(unit)` 加入实际事务。另一个对象即使打开同文件也不是此保证。ordinary read 不伪造 unit，atomic 内不另开资格事务。本采用依赖 SQLite `BEGIN IMMEDIATE` 写者排序；不承诺 PostgreSQL、跨库快照或数据库硬只读。
- selector、evaluate、根提取及生产 BodyContracts/Schema 使用同一采用版本，不复制算法或各自追最新。默认 Schema owner 首次实际使用构造，成功后复用；失败保持原异常并允许以后重试。import 不构造，显式工厂和临时作者编译不受单例规则替代。
- 可信部署清单逐项明确 capability 和布尔 meta，集合严格复制。重复、畸形、缺 meta 拒绝构造；不把旧裸数组自动补为 `meta:false`。名字、正文、持有或发布请求不决定 meta。更换清单须显式重建并核发布状态。
- 根入口提供独立当前读取器及迁移；`./publication` 属于可信宿主；`./registry-inputs` 和 `./registry-history` 是受限独立读面。独立模型调用不隐含依赖本包。

## 持久身份、发布与捕获

- `storeKey` 是显式本地源身份，不从环境或 tenant 自动选库，不跨源搜索。head 缺行表示未发布；scope 存在且空是确定空，缺行为 unavailable。
- metadata 和完整已发布版本不可修改或删除，包括 publishedAt/publishedBy；draft 不参加选版。版本序位从 1 连续，与精确版本数值一致，不能用 Number 或字典序比较；`2` 与 `2e0` 是等值版本。scope 发布替换整层，recipe 只插不改。创建时来源仅供诊断，不把以后的 current 改为 pinned。
- 单次发布在一次真实 atomic 中排序 head、版本及 scope，核 expectedRevision、完整旧版本前缀、连续新版本、能力/owner/来源、所需 pinned 引用与完整 factory。版本和配值可同次提交；确认提交后返回 revision。并发使用同 expectedRevision 的合法批次恰一批推进，不用实例锁或 marker 代替同提交。
- factory 使用本批值，否则核同事务已存值；缺行不补空。其能力集合恰等可信部署集合，来源为 actual official，assignments 为空，immutable 当且仅当 meta。漏项、添项、重复及反锁拒绝整批，更新其他 scope 不能绕过。读时再次核清单、head 和 factory。
- 旧裸格式数据库不静默补 meta 或删行迁移；存储/宿主须明确重发布或迁移后准入。invalidInput、revision conflict、真实来源/IO unavailable 分开。提交未知时调用方读实际 revision/data 决策；本包不自动重试、修复或声称超时必回滚。
- 捕获前实际 SessionTenancy owner 已建立不可变映射。本包核 holdingTenant，再在 EIS-OG 同一 atomic 取真实 effective standing。既有 recipe 只比较 tenant/root/session values/workspace；相同返回原捕获值，不同返回 conflict，不用后来角色覆写。
- 首次捕获使用当时真实来源与角色。映射建立与 recipe 捕获是两个 owner 的步骤，没有跨 owner 的会话创建同提交保证；中间缺 recipe 为 unavailable。首次 capture 的原子准入可在 mutate 内构造和求值；下文“事务后纯阶段”只约束三种读取。

## 普通当前读取

1. 先校验形状，再核实例准入，再读实际 SessionTenancy 归属，然后核当前 OG effective 和 recipe tenant。合法跨租户、未知或撤销拒绝为 unavailable；畸形为 invalidInput，即使已停止也先拒绝畸形。
2. 当前 effective 是每次资格门。input.standing 使用创建时捕获值；仍 effective 的后来角色变化不刷新 recipe。recipe、head、current scopes、所需定义和完整版本来自同一 atomic，不借另一会话、历史结果、旧 cache 或空定义补齐。
3. definitions 仅含本租户 factory/organization/tenant 当前实际 retained holdings 所需。official/owned/organization 与同快照 ownership 和外层 entitlement 对齐。明确丢失的外层资格可移除 holding；未知来源不能当作不存在继续。
4. 用共享 selector 处理 current/pinned、锁、disabled/usableBy，取同快照真实不可变 body，再提取 references/attributes/source。draft、创建时正文或空根求值不能代替实际来源。
5. 实际 atomic 结束后，在操作自有快照上做 selector、根提取及完整 evaluate。只有 evaluate 成功返回原 input；invalidInput/compositionCycle/categoryUnsupported 映射本端口 unavailable，诊断保留类别。consumer 仍以同一 input/制品求值，不交缓存结果或“已验证”标志绕过消费准入。
6. 本机 official/owned/organization、无 workspace 和无本次 MCP 动作集的已采用路径可用。shared 及沿其资格、carrier/mounted workspace 缺真实采用来源时整体 unavailable，不过滤未知 holding、不补空 fetched、不把挂载改成未挂载。本端口没有 attempt，不提供本次 MCP action snapshot。

完整链两次求值的性能责任归实际 consumer/assembly；单次组件测量不能证明完整调用性能。

## 固定根读取

可信 registry 调用前须从已核原完整 fill、同 session 的 given/filledBy/E root 及唯一 asset/version 项认回原定位。最近 readEvaluation、创建时 source、任填 ref 或 E.values 都不足以证明原 fill；无出处、不唯一或无法认回时 registry 不调用。本包不新增 origin 表或访问 MF 私表。

- 校验请求 → 实例准入 → 实际 SessionTenancy → EIS-OG atomic 当前源及指定原版本。原资产可已 unheld，但不能捏造旧 holding 或把额外定义交给 input。root capability 与 recipe 相同，实际 agent_definition 精确版本存在。
- reload 使用当前真实有效角色；refresh_availability 使用 captured role。两者均核当前资格。事务后提取固定根；selector 只核原因，不替换指定正文/来源、current/pinned 或原 session assignments。
- `{input}` 是组装结果，不保证 evaluate 为 ok；compositionCycle/categoryUnsupported 仍交 consumer 按原失败交接。
- rootSourceMismatch 只来自同 input 的真实 evaluate invalidInput、精确 diagnostics=C16，以及公共 selector 成功且实际 asset/精确 version 不同。返回原 input、selected、rejection 和真实 revision。不能凭 message 或名称判定；构件矛盾是程序缺陷。没有当前根不是 mismatch，保留共享 unresolved 分支。
- 其他可识别 bad source/non-C16 input 为 unavailable，请求错误 pre-IO 为 invalidInput；程序异常原抛。闭合 stage 使用共享定义：stopped/session_tenancy/current_membership/recipe/source/fixed_body/body_provider/evaluation_input/unsupported_source/storage。

## 历史正文读取

history 工厂绑定明确 storage/storeKey/SessionTenancy/OG/MF.readHistory 和观测端口，保留方法 receiver；旧实例不追新 MF 句柄。它不依赖 deployment/current head/current holdings/recipe/selector，不用 captured standing，不重算 availability、report gate 或运行设置，不写 scope，不向普通 definitions 注旧版本。

1. 请求含 session/tenant/category/filledAt/capability/asset/version；六类 category 与 capability 一致，filledAt 是原 table 时刻，version 是正精确版本。不接 body、proof 或默认值。
2. pre-IO 校验 → stopped → 真实 SessionTenancy。错 tenant 或未知映射时 MF/source IO 为零。
3. await 实际绑定 MF.readHistory，核原壳 session/seq/ref、对应 table 时刻及 composition 中同 capability/asset/精确 version 恰一项。E.assets 曾出现、reuse 已删项、当前表或其他旧时刻均不是 fallback。
4. MF 结束后，EIS atomic 核当前 effective 及原资产完整发布版本。实际 atomic 结束后做严格 JSON/AM/BodyContracts 纯判定，不调用 selector/evaluate。
5. AM 上下文使用真实 metadata 和完整连续已发布版本，不造只有 vN 的半份定义。exact source id/capability/category/version 一致，返回唯一完整 AssetVersion 及操作自有保护值；未知合法字段、数组顺序、精确数保真，publishedBy 原缺席仍缺席。

本包只证明局部 tuple 来源。完整 H/seq≤H、E/O/filledBy/reuse、report session/runId/attempt 和产品门控归 registry/runner，成功正文不免除这些检查。不能要求旧 E1 匹配当前 given/C16。runner 可以借 history.read；工厂与 close 仍归可信宿主。

失败只有 invalidInput 或 unavailable；闭合 stages 为 stopped/session_tenancy/manifest/history_binding/current_membership/source/body_provider/storage。没有 none、部分成功、root mismatch 或空 body fallback。MF 无源/拒绝按 manifest，非声明程序异常原抛。撤销先于 EIS atomic 排序则拒绝；读已观察 effective 可以完成，不保证返回到工具执行期间持续冻结授权。MF 和 EIS 是两个观察点，没有跨 owner 共事务/快照，不给 MF 添 participate。

## 失败、撤除与观测

- OG participate 的已声明异常先逃出 unit，实际 atomic 终结/回滚/排空后才映射 unavailable。不能 unit 内 catch 后正常提交。SourceUnavailable/StorageUnavailable/BodyProviderUnavailable 与 TypeError/StorageDefect 等程序异常区分；后者原抛，不用旧成功 cache 修复或自动重放。
- 三种 reader 各自停止新合法调用，close 幂等并等待自身已接纳的 STT/MF/atomic/纯阶段/同步诊断 Promise 实际完成。没有强制取消 MF/SQL、隐藏重试或写死 drain timeout。取消等待不是排空，不关闭借来依赖，不删持久源。
- 宿主先停止并排空消费者 → close reader → 等待所有 publication/capture → 关闭 MF/OG/STT/storage。reader.close 不覆盖发布操作；多个 effect 登记顺序不构成此保证。依赖换代明确构造新 reader，不能新消费者暗用旧关闭句柄。
- `/cordis` 的 `evaluationInputStorePlugin` 使用正式 `CurrentEvaluationInputsService` 子类及同一独立 reader；必需 storage/memberships/sessionTenancy/evaluationInputSupport 四端口。Config 只有可序列化 storeKey/deployedOfficial，资源和 callbacks 从服务取得。构造/配置失败不发布；依赖缺席 PENDING；撤除 effect await close，旧引用合法新调用 unavailable。fixed/history 不新增 Service/fiber/event。
- 诊断仅含受控身份、真实 revision/root/history seq/ref、purpose/category/filledAt、结果/closed stage 和实际成本规模。不泄漏 body、references/attributes、配值、完整 E/O、secret、原异常或未经裁剪请求；未知 seq/ref 不补造。
- sink 失败经独立 failure port 降级，两输出都失败也不改业务结果/原缺陷，不递归 fallback 或虚报事务终态。history 分别观测 STT/MF、真实锁 queue/hold、事务后 decode/judge/total，selector/evaluate 计数为零；current/fixed 记录共享纯成本与实际来源规模。任意 JS 回调启动不代表 SQL 已取得锁；观察点随真实 SQLite provider 前提解释，不承诺性能阈值。输出授权、容量和保留归宿主。

验证路径和有限前提见 [verification](verification/README.md)。共享、工作区同步、完整历史恢复、PG/跨库、历史 GC、缓存优化及强制停止时限不由本包组件通过自动获得。
