## 增量复核结论

七条处置在源码与文档层面都已闭合；新的启动资源生命周期修补沿我追的全部路径成立。没有发现新的 P0/P1。下面是本轮新发现，按"有实际触发场景"优先。

### 新发现

**1. 全新工作根的首次创建存在竞态，会留下一个工具自己创建、却永远被拒的目录（P3，设计边缘 + 文档缺口）**
- 位置：`packages/infra/storage-sql/src/maintenance/workspace.ts:63-77` 先 `mkdir(root)` 再取协调锁；标记只在 `created` 为真时以 `O_CREAT|O_EXCL` 创建（第 96-98 行）。
- 最小反例：进程 A `mkdir` 成功（created=true）→ 进程 B 得 EEXIST（created=false）→ B 先拿到 `.owner-lock` → A 拿锁得 `busy` 退出 → B 打开标记 ENOENT，报 `unavailable` 并放锁。结果：根目录存在、无标记。此后任何 open 走 `O_RDWR` 无 create 分支（第 98 行），永久 `unavailable`。
- 触发：两个离线 `verify`/`restore-isolated` 同时指向同一个尚不存在的 `--work-dir`。宿主的 `.quarantine` 先受源属主锁保护（`upgrade/owner.ts:144`），所以不暴露。
- 契约依据：deploy README 第 33 行说"let the tool create and mark it"与"a manually created empty directory is refused"，但这个目录不是手工建的，运维无法按文档区分。永久标记不变量本身未被破坏，所以归为设计允许的取舍加文档缺口，不是 D056 违约。

**2. 保留所有权的新路径下，宿主的撤后核查把"未尝试恢复"说成"恢复失败"（P3，诊断准确性）**
- 位置：`apps/tenancy-host/src/boot.ts:341-351` 在 `guard.pending()` 见到快照即报 `upgrade-unconfirmed: restoring the upgrade snapshot failed`；`guard.ts:123-134` 只看磁盘。
- 触发：全新部署首启时库不存在 → `markIfAbsent` 落标记（`owner.ts:158`）→ `SnapshotEngine.open` 抛 `WorkspaceAcquisitionIncomplete`（`owner.ts:233-241`）或句柄关不干净（`owner.ts:275-283`）。这两条路径有意不恢复、不放锁，交给下一次启动的 ② 处理，但宿主消息把它描述成恢复失败。
- 附带：这两条路径复用 `stage: 'preflight'`（`guard.ts:6` 的联合类型没有合适值），`failure.ts:7` 把 preflight 解释为 R-U8 的核对阶段。运维会先去查核对项。
- 覆盖：`maintenance-startup.spec.ts` 四场景都不到这一步；`maintenance-failure.process.spec.ts:102` 只在包级断言 `occupied`。

**3. `ownerTeardown.finish` 里恢复失败会被放锁失败覆盖（P3，极窄）**
- `owner.ts:328-345`：`site.restore()` 抛出后存入 `failure`，但 `finally` 里的 `lock.release()` 若抛 `SqliteLockIncomplete`，会取代前者，恢复失败既不抛出也不记日志。需要两个独立故障叠加。

**4. 观察，非缺陷**：`failure.ts:7-8` 把协调库上的 SQLITE_NOTADB 映射为 `invalid-data`，一个被写坏的 `.owner-lock` 会显示为 "(.quarantine): invalid-data; check the directory owner, permissions, marker..."，固定提示没有点到锁文件。SQLITE_PERM/READONLY 不在映射里，会落到通用 `storage-open` 分支而不点名 `.quarantine`。

### 七条处置

| # | 判断 | 依据 | 未覆盖 |
|---|---|---|---|
| 1 Vitest | **源码层闭合，制品层待最终证据** | `core/storage/package.json:31-35` 只在 dev；`pnpm-lock.yaml:214-228` 一致；两 suite 仅 `import type`，`tsconfig.base.json:14` 的 verbatimModuleSyntax 保证擦除；`src/index.ts` 不导出 conformance；三个 SQL 调用显式传 runner；r3 消费者检查 PASS | `fable-artifacts-audit-r1.json` 列出两份 d057-r1 制品 `testRuntimeAbsent: true`，但按你的说明制品仍在重建，最终证据须列出最终 BUILD_ID。`./conformance` 的 d.ts 仍要求消费者自备 vitest 类型，这是 D057 明说的 |
| 2 秘密文件 | **闭合** | `apps/cli/README.md:17`、`tools/package.ts:26`、`src/application.ts:84`、`src/tui/application.ts:193` 四处都写明完整内容、echo/printf 区别、无管理员重置 | 无 |
| 3 启动诊断 | **闭合，留一处缺口** | `boot.ts:147-152` 在 `StorageStartupFailure` 之后识别 `SnapshotFailure`，带 kind、点名变量与 `.quarantine`，固定建议；`maintenance-startup.spec.ts:53-87` 四场景 + 原两例，`fable-host-diagnostics-r2.log` 6/6；对 raw 日志的声明已收窄到 `startup-failed` 记录 | 上面第 2 条：Incomplete 路径的宿主消息 |
| 4 状态扫描/预算 | **文档闭合** | deploy README 第 31 行逐句与 `engine.ts:70` 的 300 s 定时器、`maintenance-command.ts:148` 的退出码一致；"requests cancellation"措辞准确，取消靠轮询与 backup 进度回调 | 未重读 catalog.ts 的 256 上限，沿用 r1 |
| 5 task-* 残余 | **文档闭合** | 第 42 行要求先停中心与所有离线命令并确认退出，只删 task 子目录，保留根/标记/锁 | 无 |
| 6 升级后旧备份 | **文档闭合** | 第 46 行写明精确迁移序列、保留旧代码离线 verify、升级后新备份 | 无 |
| 7 工作目录 | **文档闭合，留一处缺口** | 第 33 行只预备父目录、不手工建空根 | 上面第 1 条：工具自建的无标记目录 |

### 新生命周期修补

**已闭合，且我逐路径核过：**
- `workspace.ts:78-127`：marker/root/parent 三个句柄一打开就 `resources.own`，`isClosed` 用真实 `fd < 0`；`assertClean()` 让"关闭抛错但已关"不会变成假成功。
- `workspace.ts:129-144`：未 settled 先抛 `WorkspaceAcquisitionIncomplete`，协调锁不放；settled 才放锁，放锁不实关同样传 Incomplete。
- `lock.ts:23-24`：`DatabaseSync` 构造后立即入 `heldLocks`；PRAGMA/BEGIN 失败走 `close()`，仍开传 `SqliteLockIncomplete`；`release` 只 native close，观察 `isOpen`，closed 后抛错仍抛出。
- `owner.ts:233-241`：Incomplete 时保留业务句柄与源锁，不进 `abortStartup`，不恢复；`provider.ts:190-195` 正常关闭时 `ownershipReleased` 为假同样保留，`teardown.finish` 不被调用。
- 离线路径：`maintenance-command.ts:167` 抛出的 `StorageDefect` 经 `results.ts:49` 原样重抛，落到外层 catch 退出 1，进程退出后 OS 释放锁。
- 复用 primitive 的正常路径：源属主锁（`sqlite/owner.ts:75`）与工作根锁走同一 `acquireSqliteLock`，正常 release 只走一次 close，`heldLocks` 在 close 成功后删除。

**实际覆盖：** `maintenance-workspace-failure.process.spec.ts` 10 场景，positive-r2 10/10；真实子进程、`--expose-gc` 后用 `WeakRef.deref()` 观察对象仍活、另一进程探测 source 与工作根、退出后接手成功；storage 全回归 176 pass 4 skip。

**未覆盖：**
- 负对照 `fable-initialization-negative-r2.log` 只跑了 6 用例的旧 spec，5 fail 1 pass 全是 FileHandle 场景；四个 coordination 场景没有负对照证据，只有正向断言（跨进程 `busy` 探测仍有说服力）。
- Incomplete 路径的宿主级消息与阶段名（新发现第 2 条）。
- 首次创建竞态（新发现第 1 条）。
- 同一进程内 Incomplete 之后的二次尝试不适用，设计是进程退出，符合"host 不接管"。

以上是只读审查，不构成接受决定。
