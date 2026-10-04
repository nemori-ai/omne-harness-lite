# 图片准备 scope 清理接缝（候选附页）

2026-09-29 revision 2。补充已由 D109 在 HUB `716400a362c76b23b0e77f5ec23d16d43af99410` 采用的 [runtime v21 r3](v21-image-preparation-design.md) 与 [transport v15 r4](../pi-ai-transport/v15-image-preparation-design.md)，不改其字节。仅候选，主线接受前不得据此扩展实现。沿 RT10/MR9，不新增业务操作、持久 DTO、服务键或 Session/Run 实现。transport 端实现由[对应附页](../pi-ai-transport/image-preparation-scope-cleanup-candidate.md)唯一维护。

## 缺口与最小端口

v21 要求 idle scope 淘汰和 runtime close 显式释放 preparer cache。HUB 716400a3 的 `ExactTransportAcquirer` 只有 acquire，`TransportAdapter` 也没有 cache 清理口；runtime 不依赖 pi-ai-transport，因而不能直接调用图片 preparer。不是新产品责任，而是既有资源责任少一条可执行的边。

在 runtime 公开 `ExactTransportAcquirer<P,R>` 增加**必需、同步**端口：

```ts
readonly clearReuseScope: (scope: object) => void
```

只修改此公开接口的资源承接面；`TransportAdapter`/PlanInput/lease 持久与计划字段不加清理方法。port 只接受 runtime 创建并仍持有的 opaque scope，身份相等决定目标，不将内容 hash、tenant/session 身份编码或序列化进 scope。它不授权读取、不取消任务、不释放 lease、不关闭 codec、不使 scope 永久作废；之后合法调用仍可重建空表，已选缓存表被删除的旧任务不得重新发布。

使用此 acquirer 成功取得的任何 provider，只要仍可能持有该 scope 的缓存，都必须在调用返回前移除其当前表。方法不重新 acquire，不依赖当下 Cordis service 可解析，不读取网络/日志/环境。普通无图片缓存的 acquirer 也显式实现该方法为空操作；不得用缺方法、optional chain 或宽松类型断言模拟实现，也不表示图片输入已获支持。JS 非 object/null 输入同步 TypeError；有效 scope 的未知/已清/已关闭且无缓存情况成功无操作。

## Runtime 顺序和失败

1. idle LRU 淘汰：先调用 clearReuseScope，再删除 runtime scope 映射，之后才能把位置分配给另一 scope；只能淘汰真实在途计数为零的项。
2. valid scope 清理若抛错：不能假装完成或只写日志后删键。保留该项和清理责任，标记为不再用于准备；计入原 maxScopes 上限，不另建无界失败表。当次准备在发送前沿已有 unavailable 路径结束，结构化诊断只含阶段/计数，不含 raw error、scope 或图片内容。后续清理可显式重试；已有其他请求的结果不回滚。
3. 若所有位置在途或待清理，沿 v21 无复用 scope 的路径继续；不绕过原 preparation 资源上限、不跨租户复用。上项已实际触发异常的那一次不能伪报清理成功；正常无空位与异常清理是两种事实。
4. runtime close 先关准入、取消并等待所有真实准备/网络完成，再逐 scope 清理。一个抛错不阻其他 scope 清理；失败项仍被 owner 持有，close 返回既有 `{ unavailable: true }`，不能 `{ released: true }`。下一次 close 沿既有可重试 close 语义重新清理；诊断失败也不得抹掉未释放责任。关闭成功后表为空，同一 acquirer capability 才能释放。
5. 清理本身是同步删除缓存引用，无新异步任务；native decode/encode 仍由原 owner 实际 drain。不能因 scope 清理成功提前关闭共享 codec 或释放仍活跃的 lease。

runtime 构造先检查必需方法为函数，缺席在资源注册前 TypeError。factory 调用者、demo、测试替身全部破坏性迁移，无旧版兼容面。上述失败不新增业务 failure enum，资源缺失映射沿原 operation；close 的 unavailable 本来就表明仍未释放。

## 提供者能力不会因撤回丢失

当前 demo `bootstrap.ts` 的 acquirer 捕获固定 transport 实例；每个 runtime 对同一固定实例调用 acquire 和 clearReuseScope。装配借用该实例的方法闭包直到 runtime scopes 全清，不能在 service 撤回时换成 `ctx.get(...)`。此路径无需历史代际集合。

如果一个 acquirer 已允许跨服务代际 acquire，它是唯一了解取得过哪些实例的 owner：必须在对外返回 lease **之前**保有对应 cleanup capability，覆盖当前和仍持 cache 的旧代际；不只清当前解析值。不能用 lease.release 当作 provider cache 已清的证明。多代际来源管理沿装配已有有限 retention/reservation；本附页不新增通用代际注册表。未能提供有限保留及真实 cache-free 终结依据的装配，不得声称该动态 acquirer 实现完整，可选择固定代际 acquirer。重载/替换不影响旧 runtime 所持原清理闭包。

## 继承读数、选择与四表

领域性质沿提案已封存读数，未新增需求：原图不变、受信范围隔离、资源有限、真实停止后释放。仅增量机制核对；作者已看实现，未声称重新双盲。

候选 A（推荐）acquirer 必需清理口：runtime 单向依赖自身协议，provider 兑现实际缓存。候选 B 每 lease 带清理：idle lease 已释放但 cache 尚在时无权再调用，需反而长期扣 lease/复制历史集合。候选 C runtime 注入图片 preparer：暴露实现类型并使 generic runtime 直接依赖图片能力，独立 transport 替换不一致。本次接续原 A，不重开总体选型。

| 核对 | 增量结论 |
| --- | --- |
| A 性质承载 | opaque scope、清理前删表顺序、provider 保留清理能力承接 v21 既有义务；无新增领域对象 |
| B 内核排除 | 不修改 Cordis、不依赖 effect 完成顺序；一个受控 owner 组合 drain→清理→释放 |
| C 边界复核 | runtime 只见必需同步函数；所有图片缓存实现留 transport；service 撤回不撤销资源清理义务 |
| D 成本与反查 | 固定实例零新代际表；异常项仍受 maxScopes；动态 acquirer 沿既有有限 retention，不把所有历史实例无限保留 |

## 定点验收

SC1：idle scope 淘汰跨多模型 entry 后同 scope 首次重新编码，另一租户 scope 缓存仍在。SC2：service 停准入/从 Cordis 撤回后，通过原固定 acquirer 仍能清缓存。SC3：旧 lease 已释放而 cache 未清，清理仍成功；不假定 lease 存续。SC4：清理异常时项不删除、不复用、close unavailable；其他项照常清，恢复后 close 可成功。SC5：无缓存提供者必需 no-op、非法 scope TypeError、缺方法构造 TypeError。SC6：在途旧表清后不能重新发布；不取消/native 早停；runtime 正常只清 idle。SC7：动态装配若有，两个保留代际都清，已证明关闭代际不再保留，无有限 retention 的动态配置不得装配。SC8：public 独立 preparer/lease 网络结果不变；改动包双语 README 示范必需端口和停止顺序。

新增实际 bindings 0；未运行实现测试。主线后继接受、独立评审与工程验收分别记录，不能相互替代。

## revision 2：同步端口的实际返回值

TypeScript 的 void 函数类型可被 async 函数误接，检查 typeof function 不足。所有消费边界（runtime→acquirer、acquirer→service、service→preparer）都捕获实际返回值为 unknown；只有严格 undefined 算同步清理成功。其他值是提供者协议违约，与同步 throw 一样留责，不删 scope/owner、不报 released、不记录 raw 返回值。无缓存实现也须真正返回 undefined。

若实际返回 Promise/thenable，不能只挂 catch 后当成功，不能把本端口默默升级为异步清理。观察其完成/拒绝以免悬空错误，将这一清理尝试的实际终结挂在原 scope/provider owner；pending 时不对同一项重试，不增加第二个等待任务。当前 scope 仍占原有限槽位，runtime close 不得 released；若选择等待则须等真实终结，若给既有 unavailable 则原 owner 仍持有它。终结后本次仍是协议失败，下一次显式清理才可重新取得成功证据。访问 then/getter 抛错沿同步违约；未知 thenable 终结性不伪造。此为错误接线负控的留责，不增加正常路径的异步协议。

新增 SC9：async clear 延迟、reject、同步返回非 undefined 三种错误接线，所有层都不误判成功，拒绝被观察、pending 不重试、不释放 scope/codec；替换为合规清理后再试可完成。
