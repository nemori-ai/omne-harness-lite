# assembly-manifest-store 实现设计

> 本批设计已接受（2026-09-26，D-062／D-065）。此状态不表示实现或实际验证完成。

## 实现路径与来源

**自建一个薄插件：两张表、四个操作。**装配清单的换表记录与条件追加是本项目的产品语义（PF-004 §4、PF-015 §6.11），没有上游对应物；存储走本仓库已实现的 `core/storage` 协议与 `infra/storage-sql` 提供者（D-026），与据点上的其余 SQL 写入者同一实例、不另开连接。契约第十一节在「本机 JSON 文件或 sqlite 表」之间留了选择，本批取后者：条件追加要的「判定与写入同一步」「头与各类最后一条一次一致读」，协议的写事务与只读事务直接给出，JSON 文件要重造一遍。

| 用什么 | 从哪来 | 用来做什么 |
|---|---|---|
| 存储协议 `Storage`／`ReadTx`／`WriteTx`（含 `lockSentinel`）、四型失败、`mapStorageError`、`MigrationFragment` | [`core/storage`](../../core/storage/design.md#协议) | 一次写事务里判定并写下；一次只读事务里读头与各类最后一条 |
| 服务 `storage` 的实例 | [`infra/storage-sql`](../../infra/storage-sql/README.md)（据点那一份，装配给） | 必需 inject |
| `readJsonStrict`、`writeJsonLossless` | [`core/content-blocks`](../../core/content-blocks/design.md#严格的无损-json-读写)（M36；JSON 列以文本存取，M53） | `composition` 与 `content` 原样存、原样交回 |
| 类别取值 | [`core/asset-model`](../../core/asset-model/README.md) | `tables` 的键 |
| `DependencyName` 及其相等 | [`core/tool-definition`](../../core/tool-definition/README.md) | `dependencyPresence` 的输入 |
| `Instant` | [`core/offer-expiry`](../../core/offer-expiry/README.md) | `filledAt` 的表示与比较（毫秒整数） |
| `SessionRef`；不透明标识的词法 | [`core/messages`](../../core/messages/README.md)；[`core/identity-values`](../../core/identity-values/README.md) | 会话指认；`EvaluationRef` 的表示层校验 |
| `node:crypto`（随机字节） | Node 内置 | 铸 `EvaluationRef` |
| `definePlugin` | [`core/kernel-basis`](../../../../../../packages/core/kernel-basis/README.md) | 插件骨架与配置校验 |

**Cordis 版本**：`@deepseek-ai/cordis` 4.0.4（D-025）。
**配置**：只有 `presenceSource`（可选，运行时对象，只有验收装配给；在 Config 里以 `z.custom` 描述、同引用交到插件体，与 storage-sql 守卫对象同一前提）。**本节点没有策略配置项**：契约不许替写入方重试（S-3），没有计时、缓冲或上限可调。**配置错误政策：启动失败**（basis [`plugin-throw-fails-fiber`](../../../../basis/cordis/plugin-throw-fails-fiber.md)）；**缺 `presenceSource` 不是配置错误**——产品装配本来就没有来源。

## 公开面

[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)：判定以纯函数公开，闭包不依赖 Cordis；插件服务是它的一种消费者。名字全部**候选**，**全部尚未实现**。

| 层 | 导出（候选） | 做什么 | 承诺到哪 |
|---|---|---|---|
| 纯函数 | `checkManifestAppendInput(request)` | 契约 [S-17](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-17-append条件追加一条换表记录) ⑥ 的 `invalidInput` 各情形 | 只判表示层 |
| 纯函数 | `judgeManifestAppend(facts, request)` | 对一份「此刻的事实」（头、这个引用归谁、`reuse` 的目标在不在、各类最后的表时刻）依次判 `alreadyRecorded` → `evaluationRefConflict` → `recordNotFound` → `headMismatch` → `filledAtNotIncreasing`，全过答「可写」 | 只在给定的那一份事实上判；那一份是不是「提交点之前已提交的全部」，函数层不承诺 |
| 纯函数 | `answerPresence(snapshot, names)` | 契约 [S-19](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-19-dependencypresence依赖名此刻在不在场) ⑤⑧：任一名字没有事实即整次 `unavailable` | 只判给定的快照 |
| 闭包 | `createAssemblyManifestStore(storage, { presenceSource? })` → `{ readHead, append, readHistory, dependencyPresence }` | 整份契约 | 契约全部条款；前提是交给它的存储兑现 `core/storage` 协议、且没有别人改这两张表 |
| 迁移片段 | `assemblyManifestMigrations: readonly MigrationFragment[]` | 建两张表与索引（幂等） | 表的形状；装配合成 |
| Cordis 服务 | 插件 `assembly-manifest-store`，服务 `assemblyManifest` | 以注入的 `storage` 组出闭包 | 再加：据点根一份；`storage` 换代时重跑 |

**只在运行时层成立、函数层不承诺**：判定与写入同一步（S-12，要一次写事务）、头与各类最后一条出自同一刻（S-16 ④，要一次只读事务）、单写者（S-21 第二行，要存储的属主排他）。

## 能力到 Cordis 的投影

### 插件边界与服务面

**一个插件 `assembly-manifest-store`（候选名），一条 fiber，必需 inject `storage`。**它 provide 一个服务 `assemblyManifest`，方法取契约名：`readHead`、`append`、`readHistory`、`dependencyPresence`。**服务上没有任何写在场事实的方法**——契约没有那个写面（S-2），加一个就是扩展契约。插件体造闭包、登记一个 effect（撤除标记）、`ctx.provide`。**它没有进程内状态**：记录全在存储里，在场事实在装配给的来源里。

**表**（逻辑名，候选）：

| 表 | 列 | 约束 | 写入方 |
|---|---|---|---|
| `assembly_manifest_record` | `session`、`seq`（整数）、`evaluation_kind`（`given`／`mint`／`reuse`）、`evaluation_ref`（这条所依的引用）、`owned_ref`（`given`、`mint` 时等于 `evaluation_ref`，`reuse` 时为空）、`content`（无损 JSON 文本） | 主键 (`session`, `seq`)，不命名 ⇒ `assembly_manifest_record_pkey`；唯一索引 `assembly_manifest_record_owned_ref_unique` 于 `owned_ref`（空值互不冲突，两方言皆然）；`CHECK`：`evaluation_kind` 三选一、`owned_ref` 为空当且仅当 `reuse`、不空时等于 `evaluation_ref` | 本节点的 `append` |
| `assembly_manifest_table` | `session`、`seq`、`category`、`filled_at`（`Instant`，整数）、`composition`（无损 JSON 文本） | 主键 (`session`, `seq`, `category`) ⇒ `assembly_manifest_table_pkey`；唯一索引 `assembly_manifest_table_filled_unique` 于 (`session`, `category`, `filled_at`)；外键 (`session`, `seq`) → `assembly_manifest_record`，`ON DELETE RESTRICT` | 同上，与记录行同一事务 |

**没有 UPDATE、没有 DELETE**：本包没有改与删这两张表的代码路径（契约 S-11、[S-24](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-24-留存本版不删)「本版不删」；结构检查 V-4）。

### 条件追加：一次写事务

`append(session, expectedHead, record)`：表示层校验（不开事务）→ 开一次 `storage.write`：

1. `lockSentinel('assembly-manifest/' + session)`——同一会话的追加在存储里排成一列（sqlite：写事务本就持库级写锁、不发语句；pg：事务级咨询锁，`core/storage` P-5）。
2. 依次判定，读的都是本事务里看到的已提交记录：
   - `given{ref}`：按 `owned_ref = ref` 找——找到且同一会话、种类 `given` ⇒ `alreadyRecorded{record}`（连同它的各表交回）；找到而是别的会话的、或种类 `mint` ⇒ `evaluationRefConflict`；
   - `reuse{ref}`：这个会话里没有 `owned_ref = ref` 的记录 ⇒ `recordNotFound`；
   - 头 = 这个会话最大的 `seq`（没有记录即 `0`）≠ `expectedHead` ⇒ `headMismatch{head}`；
   - 记录里每个类别：这个会话这一类最大的 `filled_at` ≥ 新值 ⇒ 收进 `filledAtNotIncreasing{categories}`。
3. 全过 ⇒ `seq = 头 + 1`；`mint` 此刻铸引用（16 个随机字节的 base64url），`given` 用带来的、`reuse` 沿用 `ref`；插记录行、再插各表行；返回 `{ seq, evaluationRef, head: seq }`。
4. 插入撞任一唯一约束（`UniqueViolation`）⇒ **同一事务内重判一次**（语句级失败不废事务，`core/storage` P-2）：重判得出结论即答它；重判仍全过 ⇒ 缺陷上抛（说明有写入者绕过了哨兵，或铸出的引用撞了）。本版能走到这一步的正常情形只有一种：**两个不同会话同时以同一个引用 `given`**——它们的哨兵不同名，后提交的那个撞 `owned_ref` 唯一索引，重判得 `evaluationRefConflict`。

### 关键选择

**一、按会话的存储哨兵 ＋ (会话, 序号) 主键（选）。**

| | 不取哨兵，只靠主键冲突：两路都判「头对得上」、都插 `seq = 头 + 1`，后者撞主键后重判 | 每个会话一行「头」，写事务里对它 `lockRow` | **写事务开头取按会话命名的哨兵，主键兜底（选）** |
|---|---|---|---|
| 落选方的最强论证 | 不多一条语句；正确性完全落在库里的约束上 | 「头」就是被读的那一行，锁它最直接 | —— |
| 本方弱点 | —— | —— | pg 上每次追加多一条咨询锁语句；`hashtext` 碰撞让两个会话互相等待（只多等，不错） |
| 为什么选它 | 判定次序要靠「撞了再重判」才守得住：输家的 `alreadyRecorded`、`recordNotFound` 都是在对手提交之前判的，只有重判才对——对的，但每一种结论都要经过这条迂回，它成了常路而不是兜底 | pg 上一个会话的**第一次**追加没有「头」那一行可锁（锁定读锁不住不存在的行，`core/storage` 协议 `lockRow` 一行的说明）；要先插后锁，又回到左列的冲突路 | 同一会话的追加在存储里真正排成一列，判定次序平铺直叙；主键仍在，哨兵被绕过时照样挡住第二条 `seq`。与执行宿主「同会话写由存储哨兵序列化」同一做法 |
| 置信度 | | | 高 |

**两个写入者共同触碰的存储对象**：**`assembly_manifest_record` 的主键 (`session`, `seq`)**——头就是这些行里最大的 `seq`；同一会话的追加另经**同名哨兵**在存储里排队（sqlite 的库级写锁、pg 的事务级咨询锁，都在存储一侧、随事务结束释放，不是进程内锁）。求值引用的全局唯一落在 **`owned_ref` 唯一索引**上。跨 owner 那一侧：会话资产注册表以这一次追加为换表的提交点（`capability.asset-registry/v2#S-18`；注册表节点[关键选择三](../../tools/asset-registry/design.md#关键选择)），**它与本节点共同触碰的就是这个主键**。

**反证四条交错**：

- **同一注册表实例两次并发换表，都以头 3 追加**：sqlite 上第二个写事务在 `BEGIN IMMEDIATE` 处等第一个提交，进来读到头 4 ⇒ `headMismatch{4}`；pg 上第二个在哨兵处等，拿到后读到头 4 ⇒ 同上。把哨兵拿掉（故障注入）⇒ 两者都插 `seq = 4`，后者撞主键、重判得 `headMismatch{4}`；把主键**也**拿掉 ⇒ 出现两条序号 4——契约场景 [S-26](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-26-条件追加两路并发恰一路成) 的故障注入支要它必须失败。
- **注册表旧实例在途的追加 × 新实例的追加**（注册表因提供者换代重跑，内核不取消旧实例手上那一次）：两者经同一个 `storage` 实例（或它换代后的新实例，指向同一库文件）写同一张表——序列化与主键都在库里，与哪个插件实例发起无关；后到者 `headMismatch`，按注册表节点关键选择三重建重做。
- **两个会话同时以同一个引用 `given`**：哨兵不同名、不互等；两者都判「这个引用没人用」⇒ 都插 ⇒ 后提交者撞 `owned_ref` 唯一索引 ⇒ 重判得 `evaluationRefConflict`。只有唯一索引挡得住这一条——本版 `given` 的引用由装配交来，全局唯一靠的就是它（契约 S-21 第三行左列）。
- **装配那一次提交之后、回执之前进程被杀，注册表以同一 `given{e1}` 重交**：记录已在 ⇒ `alreadyRecorded{record}`（判在 `headMismatch` 之前，契约 S-17 末段）。`mint`／`reuse` 同样情形下重交得 `headMismatch`，由注册表读头比对（契约 S-22 第 2 条、G-7）。

**反证不了、要真跑的**：pg 上两个存储实例、两个进程的真并发（sqlite 那一半由库级写锁给，套件 C-4 已证协议层）——见 [verification](verification.md#证据义务) S-26、V-1、V-2。

**二、`EvaluationRef` 用 16 个随机字节铸（选）。**

| | 全表一个递增计数 | 按会话计数拼上会话指认 | **随机 128 位，唯一索引兜底（选）** |
|---|---|---|---|
| 落选方的最强论证 | 不可能撞；短 | 不跨会话争用 | —— |
| 本方弱点 | —— | —— | 理论上可撞；撞了由唯一索引挡住、按缺陷响，不静默复用 |
| 为什么选它 | 全表一个计数要一把跨会话的锁或序列，所有会话的追加都排在它后面 | 引用成了可解析的结构（契约 S-8：本契约与消费者都**不得解析**它）；跨进程时铸法本身不保证唯一 | 契约 S-21 第三行右列要「铸法本身保证唯一、不靠单点查重」——随机铸法跨进程照样成立；本版单机另有唯一索引 |
| 置信度 | | | 高 |

**三、在场事实以配置交进来，只有验收装配给（选）。**

| | 服务上加一个「给出在场事实」的方法，测试调它 | 一张在场事实表，测试种子写进去 | **配置 `presenceSource`：一个按 (会话, 名字集合) 交出同一刻快照的对象，由装配给；缺席即判不出（选）** |
|---|---|---|---|
| 落选方的最强论证 | 事实能随时间变，调用最自然 | 事实持久，重启之后仍在 | —— |
| 本方弱点 | —— | —— | 产品装配没有来源，`dependencyPresence` 恒 `unavailable`（契约 G-2 的如实后果）；来源若是一个不稳定的实现，本节点只能如实转交它的「判不出」 |
| 为什么选它 | 服务上多出一个契约没有的写面（S-2「在场事实的来源与写面本版不收」）——**扩展了契约**，而且整棵树都看得见它 | 产品库里会有一张没有写入方、却可能被误写的表；契约 S-23 默认「重启之后不沿用」，持久它要另写理由 | 服务面恰是契约的四个操作；「事实从哪来」停在装配这一层，与契约的归属一致 |
| 置信度 | | | 中高 |

**四、必需 inject `storage`（选）**——理由同 [session-tenancy-table 关键选择一](../../session/session-tenancy-table/design.md#关键选择)：表是唯一权威，没有存储一个操作都答不出（basis [`inject-has-no-optional-form`](../../../../basis/cordis/inject-has-no-optional-form.md)）；本节点没有活状态，重跑无损。连带：注册表必需 inject 本服务，`storage` 换代 ⇒ 本插件重跑 ⇒ 注册表重跑、缓存丢弃、按清单懒重建（注册表节点「提供者换代时收掉什么」）。据点装配本版运行期不换代。

### 契约责任到插件、服务与操作

契约的九件事本表不复述，只写兑现点与缺口。方法名取契约，其余名字标候选；全部**尚未实现**。

| 契约责任 | 插件、服务／贡献或公开操作 | 实现／源码与采用版本 | 符合性依据或缺口 |
|---|---|---|---|
| [S-5](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-5-一个会话一列换表记录) 一列只增的记录 | 两张表，按 `session` 分列；没有改删路径 | 尚未建包 | 从没追加过的会话读得头 `0`、空映射——读得到的事实，不是失败 |
| [S-6](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-6-记录与它的壳) 记录与壳 | 记录行 ＋ 每类一行表行；`tables` 非空、类别两两不同由表示层与主键双守 | 尚未建包 | `composition`、`content` 不解释 |
| [S-7](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-7-序号与头) 序号与头 | `seq = 头 + 1`；头 = 最大 `seq` | 尚未建包 | 稠密：只有一个插入点、在序列化之下 |
| [S-8](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-8-求值引用-evaluationref) 求值引用 | `owned_ref` 唯一索引；`given` 认回、`mint` 随机铸、`reuse` 沿用 | 尚未建包 | 本节点不解析引用；权威在契约 S-8 |
| [S-9](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-9-表时刻同一类别上严格递增) 表时刻严格递增 | 事务内按 (会话, 类别) 取最大 `filled_at` 比较；唯一索引兜底 | 尚未建包 | 按整数比较，不按字典序 |
| [S-10](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-10-在场事实) 在场事实 | `presenceSource`（配置） | 尚未建包 | 不进序号、不影响头；产品装配没有来源（AMS-2） |
| [S-11](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-11-只增不改原样存原样交回) 原样存 | 严格无损读写，文本列 | 尚未建包 | 交来的不是合法 JSON 值 ⇒ `invalidInput`；自己存的读不出 ⇒ 缺陷 |
| [S-12](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-12-条件追加判定与写入是同一步) 条件追加同一步 | 上文「一次写事务」 | 尚未建包 | 共同对象与反证见[关键选择一](#关键选择) |
| [S-13](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-13-提交与持久) 提交与持久 | 记录行与表行同一写事务（`core/storage` P-1） | 尚未建包 | 断电边界 AMS-4；升级恢复 AMS-5 |
| [S-14](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-14-缺席时的默认答案) 缺席默认 | `expectedHead`、`evaluation` 必填；读不到答 `unavailable`、不交头 `0` | 尚未建包 | 见[失败映射](#状态并发与失败映射) |
| [S-16](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-16-readhead读头与每一类最后一条) `readHead` | 一次 `storage.read`：头 ＋ 每类最大 `filled_at` 那一行所属的记录 | 尚未建包 | 同一只读事务 ⇒ 同一刻（`core/storage` P-6）；「便宜」是两条语句，没有测量（AMS-10） |
| [S-17](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-17-append条件追加一条换表记录) `append` | 上文「一次写事务」 | 尚未建包 | 判定次序照 ⑥；`given` 幂等不看期望头 |
| [S-18](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-18-readhistory按表时刻读回一条) `readHistory` | 按 (会话, 类别, `filled_at`) 唯一索引取表行 → 取整条记录 | 尚未建包 | 同一组参数永远读回同一条（不删） |
| [S-19](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-19-dependencypresence依赖名此刻在不在场) `dependencyPresence` | 表示层 → 没有来源 ⇒ `unavailable` → 来源交一份快照 → `answerPresence` | 尚未建包 | 任一名字缺事实 ⇒ 整次 `unavailable`，不答 `absent` |
| [S-20](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-20-本版不发事件) 不发事件 | 不 `emit`、不监听 | —— | —— |
| [S-21](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-21-装配给的保证-vs-协议须给的保证) 装配给 vs 协议给 | 见[下节](#装配给与协议给本节点单机怎样兑现左列) | —— | —— |
| [S-22](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-22-回执丢失与结果未知) 结果未知 | 不另做：`given` 由唯一索引认回，`mint`／`reuse` 由写入方读头比对 | —— | 契约 G-7 |
| [S-23](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-23-提供者撤除换代与重启) 撤除、换代、重启 | 没有活状态；在场事实随配置重给 | —— | 重启后在场事实**不沿用**：来源由装配重新给出 |
| [S-24](../../../../spec/capabilities/assembly-manifest/v2/contract.md#s-24-留存本版不删) 本版不删 | 没有删除路径；外键 `RESTRICT` 另挡住只删记录行 | —— | —— |

### 依赖、作用域与绑定

| 消费的精确契约或服务 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| 服务 `storage`（`core/storage` 协议） | **必需 inject**；据点那一份 `infra/storage-sql` | 换代 ⇒ 重跑（basis [`plugin-body-reruns-on-provider-change`](../../../../basis/cordis/plugin-body-reruns-on-provider-change.md)） | 缺席 ⇒ `PENDING`，服务不出现；注册表随之 `PENDING`（它必需 inject 本服务） |
| 在场事实来源 `presenceSource` | 配置；**只有验收装配给** | 启动时定下 | 缺席 ⇒ `dependencyPresence` 恒 `unavailable`；来源抛出 ⇒ 缺陷上抛 |
| 迁移 | 本包导出片段，**装配合成**（[core/storage 共用形状](../../core/storage/design.md#迁移片段与迁移前核对的共用形状)） | 启动时在 `provide('storage')` 之前跑 | 片段缺了 ⇒ `StorageDefect` 上抛（装配缺陷） |

**消费者**：会话资产注册表（必需 inject；`readHead`、`append`、`readHistory`）、拓展点派发（调用时取用；`readHead` 读链——读法未约定，契约 G-4——与 `dependencyPresence`）、模型请求运行时（调用时取用；读求值结果——同 G-4）。

### 会话资产注册表的要求（R-M1～R-M9）的承接（互指）

注册表节点[对装配清单提供者的要求清单](../../tools/asset-registry/design.md#对装配清单提供者的要求清单)写了「最小提供者节点立起来时写一条对应本节的要求，两边互指」。下表是本节点这一侧；那一侧 A-1 的改指由主线做。

| 注册表的要求 | 本节点的兑现点 |
|---|---|
| R-M1 条件追加；(会话, 序号) 唯一 | 按会话哨兵 ＋ 主键 `assembly_manifest_record_pkey`（[关键选择一](#关键选择)） |
| R-M2 `fill` 以装配交来的引用为键、再交认回、三者可区分 | `owned_ref` 唯一索引；`alreadyRecorded` 判在 `headMismatch` 之前；`unavailable` 只来自存储读写失败 |
| R-M3 `reload` 铸新引用、收窄沿用 | `mint` 随机铸；`reuse` 沿用且 `owned_ref` 为空 |
| R-M4 便宜地读头；头与各类最后一条一次一致读 | 一次只读事务、两条语句；「便宜」无测量（AMS-10） |
| R-M5 一条记录带齐被换各表的完整构成与 `filledBy`、`basedOn`、`filledAt`；不可改 | 表行存 `filled_at` 与 `composition`；`content` 原样存 `filledBy` 等；`evaluation_ref` 即 `basedOn`；没有改路径 |
| R-M6 「没有装配记录」与「读不到」可区分 | 头 `0` 是读到的事实；读不到是 `unavailable` |
| R-M7 追加成功即持久；断电边界 | `core/storage` P-7；断电边界 AMS-4（D-027） |
| R-M8 不可用可识别，不返回空或旧快照 | `StorageUnavailable` ⇒ `unavailable` |
| R-M9 历史记录按 (会话, 类别, `filledAt`) 读回，会话存续期内不删 | 唯一索引 `assembly_manifest_table_filled_unique`；不删（强于要求）；升级恢复一支见 AMS-5 |

### 对存储提供者的要求清单

| # | 要求 | 对应条款 | 协议兑现点（`core/storage`） |
|---|---|---|---|
| R-AMS1 | 记录行与表行在一次写事务里全成或全不成 | S-13 第 1 条 | `write(fn)`，P-1 |
| R-AMS2 | 同一会话的写事务排成一列，且排在判定之前 | S-12 第 2 条 | `lockSentinel`，P-5（sqlite 由 `BEGIN IMMEDIATE` 给） |
| R-AMS3 | 写事务内读到全部已提交写的最新值 | S-12 第 2 条 | P-3 |
| R-AMS4 | 唯一冲突可识别、名字稳定；冲突之后事务仍可用 | S-8、S-9、S-12 第 3 条 | `UniqueViolation { constraint }`，P-11；P-2 |
| R-AMS5 | 一次只读事务看到同一个已提交快照 | S-16 ④ | `read(fn)`，P-6 |
| R-AMS6 | 提交之后跨进程重启仍在 | S-13 第 2 条 | P-7；**断电边界**：`synchronous = NORMAL`（D-027）——AMS-4 |
| R-AMS7 | 读不到可识别，不返回空或旧快照；缺陷不折成不可用 | S-14 | `StorageUnavailable`、`StorageDefect`，P-8 |
| R-AMS8 | 外键两向可识别、不延迟；`ON DELETE RESTRICT` | S-24（结构兜底） | P-10 |
| R-AMS9 | 迁移幂等；唯一约束用 `CREATE UNIQUE INDEX` 显式命名、主键不命名 | 依 [storage-sql 对迁移文件的要求](../../infra/storage-sql/design.md#依赖作用域与绑定) | 装配合成 |

## 状态、并发与失败映射

**本插件没有进程内状态。**写权：两张表只由本节点的 `append` 写。提交点：那一次写事务的提交。并发：同一会话经存储哨兵排队；不同会话并行；读不排队。

| 情形 | 映射 |
|---|---|
| 输入不合（S-17 ⑥、S-16 ⑥、S-18 ⑥、S-19 ⑥ 列的各情形） | `invalidInput`，不开事务 |
| 五道判定得出「不写」 | 按判定次序的具名值 |
| 插入撞唯一约束 | 同一事务内重判一次；重判得结论即答它；仍全过 ⇒ 缺陷上抛 |
| `readHistory` 没有那一条 | `recordNotFound` |
| `StorageUnavailable`（读、写、提交） | `unavailable`；追加时意思是「没有确认提交」（契约 S-22） |
| `StorageDefect`、`ReferenceViolation`、`CHECK` 违反、自己存的 JSON 读不出 | 缺陷：原样上抛、error 日志——不折成 `unavailable` |
| 没有 `presenceSource`；来源答「读不到」；来源的快照缺任一名字 | `dependencyPresence` 答 `unavailable` |
| 来源抛出 | 缺陷上抛 |
| 本实例已撤 | `unavailable` |

## 成对的装载与撤除

| 取得的资源／注册贡献 | 实例拥有者与对外可用时点 | 部分初始化失败 | 撤除、静止／交接与保留范围 |
|---|---|---|---|
| 配置校验 | `definePlugin` 在插件体之前 | 失败 ⇒ `FAILED`、不 provide | —— |
| `ctx.provide('assemblyManifest')` | 本 fiber；`storage` 在时插件体运行、立即可解析 | 抛出 ⇒ 随 fiber 撤（`provide` 经 effect 纳管：kernel-basis probe `provide-is-effect-managed`，**待核对主张**） | 服务消失；注册表随之重跑或 `PENDING` |
| 撤除标记（一个 `ctx.effect`） | 本 fiber | —— | 置标记；此后到达的调用答 `unavailable`。**在途的追加跑完，按它那一次写事务的提交收场**（内核不取消在途调用；`storage` 若同时在关，它关准入之前已进入的事务照常提交或回滚，storage-sql 撤除②）。**保留**：两张表里的全部记录——撤除什么都不删 |

## 装配给与协议给：本节点单机怎样兑现左列

照契约 S-21 逐行；右列本节点一条都不兑现。

| 保证 | 本节点单机怎样给 | 归谁 |
|---|---|---|
| 条件追加在提交点上判、与写入同一步 | 一次写事务：哨兵 → 判定 → 写 | 本节点 ＋ `core/storage`（P-1～P-5） |
| 单写者 | —— | **装配**：`storage-sql` 的属主实例（带升级守卫）让一份库只有一个写者进程（据点装配 S-g） |
| 求值引用全局唯一 | 随机铸 ＋ `owned_ref` 唯一索引，同一份库 | 本节点 ＋ **装配**（据点只有一份 `storage`） |
| 读到的头与各类最后一条出自同一刻 | 一次只读事务 | 本节点 |
| 提交即持久 | `core/storage` P-7 | `storage-sql` ＋ 主线（断电口径 D-027，AMS-4） |
| 在场事实的来源可信 | 转交配置里的来源 | **装配**：验收装配给测试种子；产品装配没有（AMS-2） |
| 调用方身份已核实 | 进程内能力间面 | **装配**：不把本服务接到任何入口 |

**归装配的事项**（点名给 `apps/cli`）：合成本包的迁移片段（**只在验收装配**）；`presenceSource` 只在验收装配给（测试种子），产品清单不给——结构检查守住（V-4）；`storage-sql` 开升级守卫并**在确认之后才开闸**——确认之前追加的记录会随快照恢复消失，打破「本版不删」（AMS-5）——这一前提已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点）；只装一份、装在根上；不暴露成入口。

## 实施缺口与消费者影响

契约第十节的缺口不重抄；下表是**本节点自己的**缺口，编号 AMS-n 只在本节点内有效。

| # | 缺口 | 受阻的消费或条款 | owner | 闭合条件 |
|---|---|---|---|---|
| AMS-1 | **真承接者未到**（契约 G-1，据点装配 C-2） | 产品据点清单里注册表停在 `PENDING`（本版不装本节点） | 主线 → PF-004 那一程 | 那一程的装配清单契约收下或取代 AM v1，提供者节点互指或取代本节点 |
| AMS-2 | **在场事实在产品装配里没有来源**（契约 G-2）：`dependencyPresence` 恒 `unavailable`；这个查询是否该住在装配清单里，语义归属仍存疑 | 派发器对带 `needs` 的件恒收「判不出」 | 主线（这个查询的家）；PF-006 依赖解析与据点装配那一程（事实的来源） | 事实有写面与来源；若家不在这里，从契约新版移出、本节点删掉这一查询 |
| AMS-3 | **派发器读链与模型请求运行时读求值结果读不出**（契约 G-4）：本节点原样交回写入方记下的 `content`，读法没有约定 | 派发器服务面的链与不可用处置、模型请求运行时的选中初值、层锁与两个时限（验收里由测试经函数面直接交值） | PF-004 那一程（C-2） | 那一程定下记录里求值那一部分的形状与读法 |
| AMS-4 | **断电边界**（契约 G-3；已知边界，主线已裁（D-060 §八 N-40））：边界与论证见 [session-log-jsonl SLJ-2](../../session/session-log-jsonl/design.md#实施缺口与消费者影响)，本节点不另论证。落在本节点的后果：注册表已被告知成功，重建出来少一次换表 | S-13 第 2 条、注册表 R-M7 | 主线（已知边界） | 不闭合的已知边界；产品要求断电不丢时另出决定、契约出新版 |
| AMS-5 | **升级恢复撤掉确认之前的记录**：与「本版不删」冲突的唯一一条路径；与 AMS-4 同一条已知边界的另一条来路（[SLJ-2](../../session/session-log-jsonl/design.md#实施缺口与消费者影响)） | S-24、S-13 | 装配 | 不闭合的已知边界；由「开闸在确认之后」挡住——前提同 [SLJ-2](../../session/session-log-jsonl/design.md#实施缺口与消费者影响)，已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（据点清单 A-28，产品与验收装配同一时点：全部 fiber `ACTIVE` 之后 `guard.confirm()`，确认之后才开闸；证据义务 `assembly.upgrade-confirmed`，名候选，归 cli 节点） |
| AMS-6 | **pg 上的哨兵与重判路径只在 `OMNE_TEST_PG_URL` 可连时能测**；跳过不是通过 | S-12 在 pg 上的证据 | 实现者 | 有可连的 pg 时跑并登记 |
| AMS-7 | **产品据点清单本版不装本节点**（据点装配关键选择 5）；装上即完整兑现换表那三个操作，在场查询恒 `unavailable` | —— | 主线 | 据点装配的改选条件成立 |
| AMS-8 | `mint`／`reuse` 没有认回键（契约 G-7）：单机单写入者时由注册表读头比对 | 跨进程或多写入者 | 主线；PF-004 那一程 | 契约出新版给请求键 |
| AMS-9 | **领域落点**：本节点放 `assets` 是本批划分；PF-004（agent 定义与装配）那一程可能把装配清单归别的领域 | —— | 产品负责人 ＋ 主线 | 那一程定领域时一并搬（节点与源码同步） |
| AMS-10 | `readHead` 每次两条语句，注册表每个操作都先读头（注册表节点关键选择二）；没有测量 | 注册表 `lookup`／`list` 的延迟 | 实现者 | 有测量再议（例如按会话一行物化的头） |

**报给主线**（不在本节点改）：注册表节点 A-1 与 R-M1～R-M9 改指本节点、两边互指；派发器（RUN-N5，`dependencyPresence`）、模型请求运行时（MRR-N3，读求值结果）与据点装配（验收装配表「装配清单」一行、A-7、C-2）改指本节点；AMS-5 的开闸次序已由 [cli 升级确认在第一次受理之前](../../../apps/cli/design.md#升级确认在第一次受理之前) 承接（A-28，与 SLJ-2、STT-3 同一前提），不再报；AMS-2 的归属存疑仍在契约 G-2。
