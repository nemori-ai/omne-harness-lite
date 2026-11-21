# 媒体保管：性质、模型与设计的对应

本页说明 [MediaCustody.tla](MediaCustody.tla) 守住哪些性质，模型的变量和动作对应[媒体规格](../../../../packages/media/SPEC.md)里的哪些操作，每份配置预期得到什么。

模型检查只说明有限范围内的设计性质。它不证明源码精化。

## 性质表

| 性质 | 说的是什么 | 违背的后果 | 对应的不变式 |
| --- | --- | --- | --- |
| `LiveIsDurable` | 暂存或持有的对象，字节已经耐久 | 引用指向读不出的内容 | ME-1 |
| `BytesHaveRow` | 有字节的对象一定有元数据行 | 崩溃后留下没人知道的字节 | ME-2 |
| `HeldStays`、`ClaimsOnHeld` | 持有不可逆；持有记录只指向持有中的对象 | 被引用的媒体被清掉 | ME-3 |
| `LogRefsResolve` | 引用方日志里引用的对象被持有、字节耐久、属于同一租户 | 悬空引用；跨租户引用 | ME-4 |
| `HandedOwn` | 交给一个租户的引用只指向它自己的对象 | 跨租户泄漏 | ME-5 |
| `OneLivePerDigest` | 同租户同摘要至多一个活对象 | 同一份字节重复存放 | ME-6 |
| `PurgeCompletes` | 标了删除的对象最终删掉，跨进程崩溃也一样 | 空间不归还 | ME-7 |

## 模型与设计

三方：字节存放、元数据、一个引用方。引用方先持有、后写自己的日志；它代表会话的受理（处理件在提交之前运行），也代表工具结果的提交。

| 模型 | 设计里的操作 | 源码位置（`packages/` 下） |
| --- | --- | --- |
| `Begin` | 开始上传：先写下「上传中」的元数据行 | `media/media/src/uploads.ts` 的 `begin`（`MediaIndex.insertUploading`） |
| `WritePart`、`Seal` | 字节存放端口的追加与封口；封口的答复之后字节耐久 | `uploads.ts` 的 `append` 与 `sealedBytes`（`ByteStore.seal`）；本机存放在 `media/media-storage-local/src/index.ts` |
| `Commit` | 提交上传：一次元数据事务里进暂存，或并入同租户同摘要的活对象；之后才交出引用 | `uploads.ts` 的 `commit` 调 `media/media/src/objects.ts` 的 `settle`（`MediaIndex.stageOrMerge`；SQL 在 `media/media-storage-sql/src/store.ts`） |
| `Abandon` | 放弃上传，或上传期满 | `uploads.ts` 的 `abandon` 调 `objects.ts` 的 `discard`（先标删除，再删） |
| `Expire` | 暂存期满 | 时钟条件，没有单独的代码：`settle` 写下 `expiresAt`，由下一行的清扫判 |
| `SweepMark` | 到期清扫：一次带条件的元数据写（仍是暂存、仍已到期） | `media/media/src/custody.ts` 的 `sweep`（`MediaIndex.markDeletingIfExpired`） |
| `PurgeBytes`、`PurgeRow` | 删除：先删字节，后删行 | `objects.ts` 的 `erase`：`ByteStore.remove` 之后 `MediaIndex.dropRow` |
| `Hold` | 持有：一次带条件的元数据写，核租户与状态 | `custody.ts` 的 `hold`（`MediaIndex.holdIfLive`；SQL 在 `media/media-storage-sql/src/rows.ts` 的 `hold`） |
| `LogCommit` | 引用方把引用写进自己的事实 | 会话：`media/media-adapters/src/index.ts` 的处理件先持有，Session 在 `session/session/src/command.ts` 里提交；工具结果：`media-adapters/src/cordis.ts` 提供的 `toolMediaStore` 经 `custody.ts` 的 `put` 带持有方存入 |
| `Retry` | 持有之后、写日志之前请求丢失，同一条输入再来 | Session 凭 `session/session-contract/src/decide.ts` 的 `commandDigest` 认出同一条输入；对已持有的再持有是幂等的 |
| `Crash` | 进程崩溃：行、字节、持有与日志都在；在途的请求与清扫读到的东西丢失 | 没有单独的代码：重启之后 `sweep` 经 `MediaIndex.listDeleting` 接着删标了删除的对象 |

## 配置预期

| 配置 | 预期 | 打开的缺陷 | 违反的性质 |
| --- | --- | --- | --- |
| `custody` | 通过 | 无 | — |
| `custody-live` | 通过 | 无 | — |
| `bad-ref-before-durable` | 失败 | 字节没耐久就交出引用 | `LiveIsDurable` |
| `bad-sweep-check-then-act` | 失败 | 清扫先读后删，中间不再核对 | `ClaimsOnHeld` |
| `bad-log-before-hold` | 失败 | 引用方先写日志后持有 | `LogRefsResolve` |
| `bad-row-delete-first` | 失败 | 先删行后删字节 | `BytesHaveRow` |
| `bad-dedupe-across-tenants` | 失败 | 并入不分租户 | `HandedOwn` |
| `bad-hold-skips-tenant` | 失败 | 持有不核租户 | `LogRefsResolve` |

范围：3 个对象、2 个租户、1 个摘要、每租户 1 条输入、至多 1 次崩溃。运行 [run-tlc.sh](run-tlc.sh)：名字以 `bad-` 开头的配置必须以违反结束，其余必须干净结束，脚本按此给出退出码。

## 抽象与未覆盖

- 字节的内容与摘要的计算被抽象成一个标签。
- 只有一个存放提供者；多个提供者并存、搬迁不在模型里。
- 表示、请求版本、转换引擎的登记不在模型里。
- 持有没有归还这个动作。
- 存放与元数据各自的耐久语义是前提，由提供者的符合性套件核。
- 租户身份的核验本身是前提。
