# MF4 provider binding

The standalone factory and migrations stay in the pure root. The concrete services and plugin are exported only from `./cordis`.
Business behavior belongs to [assembly-manifest](../../core/assembly-manifest/SPEC.md).
SQL algorithms, tables, identities, capacity, error order and diagnostic facts are unchanged by this binding migration.

The named `assembly-manifest-store` plugin requires storage and assemblyManifestResources.
Its configuration is a strict empty serialized object. Callbacks and runtime handles must be injected through the resource service.
Missing required services hold the consumer pending. Invalid configuration rejects startup.
`AssemblyManifestResourcesService` validates ports before publication and snapshots the option fields.
An explicit empty resource service selects the original optional-port defaults.
The caller can supply an assembly-owned `AssetEvaluator` through `ManifestOptions`.
The store creates one evaluator at construction when the caller omits it.
Both evaluation projection reads reuse this evaluator and still validate each complete value.
A replacement store keeps a separate evaluator unless its assembly explicitly supplies a shared owner.
The store does not close a borrowed evaluator.

The source object and functions remain borrowed. The factory captures the PresenceSource object and the two callback references once.
It calls diagnostic and diagnosticFailure as bare functions, without binding this to Cordis or the caller Context.
It calls presenceSource.read through the captured source object; it does not snapshot or bind that method separately.

`AssemblyManifestStoreService` extends the existing public six-operation Service.
Its close effect is registered before publication. It owns one factory and borrows storage and ports.
Withdrawal invokes factory close immediately. Valid new calls return unavailable; original invalid-input precedence remains.
Admitted operations continue on the captured generation. All six old callable references retain this stop policy.

The concrete provider's stable `closed` promise stays pending until factory drain and diagnostics finish.
It can be captured by assembly code that selects this provider. It is not a seventh business operation or a promise made by borrowed adapters.
Repeated inactive fiber disposal is not an observation of drain.
Close rejection remains observable on `closed`; its internal observer only prevents unhandled rejection.
Only fulfillment establishes drain. On rejection the owner must inspect and retain resources while release remains unproved.
Borrowed resources are never closed automatically. A new provider may be available while old admitted work still owns its generation.

## SQL storage responsibility

parent assembly_manifest_record(session,seq) 与全部 assembly_manifest_table(session,seq,category) 同写事务；同会话同名哨兵及主键排序裁决，owned_ref 同库全局唯一，表时刻唯一、外键且不删。多个 registry 实例只经 MF append 触碰这个共同对象，不另建登记／locator 库。

safe-integer 是实际持久 seq/head 容量，不是 expectedHead/H 请求域；请求用 JsonNumber/ExactDecimal。超大合法 expectedHead 按 given/ref/reuse 优先级之后 headMismatch，不提前 invalidInput；readGiven 超大 H 先真读 head 再判范围。达到 MAX_SAFE_INTEGER 在加一、铸 mint、任意 INSERT 前 unavailable 且零写，不牵连 content 大整数。

只有首条 parent INSERT 唯一冲突，在 storage 语句原子且同事务可读胜者时，允许同事务重判一次。table INSERT 冲突必须逃出 write，让整次回滚。不可任意 catch UniqueViolation 后以本次暂存 parent 认回并提交半截；mint 随机引用碰撞不是 given 认回，不自动重铸。方言前提不足则停止该方言交付，不改失败次序。

同一真实 ReadTx 读 head／选 parent／读全 tables/content。不用 INNER JOIN 将坏 parent 藏成 none，不按 latest 滤掉 given 旧表。已观察持久内容损坏与 SQL schema/API/程序缺陷分开，不能 catch-all StorageDefect。迁移、刷盘和物理断电范围沿实际 storage/装配；SQLite 结果不证明 PG。

Required verification is indexed in [verification](verification/README.md).
