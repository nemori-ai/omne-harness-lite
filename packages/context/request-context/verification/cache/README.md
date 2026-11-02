# 候选缓存的代际发布、撤代与借用的有限模型

[CandidateCache.tla](CandidateCache.tla) 检查 request-context 候选缓存（R7/CX-14）在代际发布、撤代、借用、历史追加、压缩、资格变化与重叠调用之间的交错。模型检查只说明给定抽象和有限范围内的性质。它不证明产品实现符合模型，也不证明真实来源的页协议满足模型的假设。

## 采用与边界

本资源按 #502 revision 3 attempt `502-r3-a2` 的 M-CACHE 闭包维护。采用的源码基线是 `19d29418674d3813ddd817f56c504db6e4a2d84d`。设计依据是 C-CACHE 闭包规格与下表的拥有者。

| 契约拥有者 | 本模型采用的承诺 |
| --- | --- |
| [RQ-12 来源集合与登记面](../../../request-context-contract/SPEC.md#rq-12-来源集合与登记面) | 每次操作借用一个集合代际。发布前在登记拥有者的一次同步本地动作里核代际仍有效。先撤除，旧操作不能成功。代际已撤除或替换时返回不可用，不从另一集合补读 |
| [RQ-13 七组的稳定读取](../../../request-context-contract/SPEC.md#rq-13-七组的稳定读取) | 准备键由来源代际、主体键、候选身份、消费位置、用途与六组令牌组成。令牌绑定来源实例的代际，禁止 ABA。epoch 已变时重读从新的历史依据开始，不沿用旧页 |
| [request-context SPEC 候选缓存](../../SPEC.md#候选缓存) | 存候选内容与各层渲染结果，不存结局。全部相等才复用。同 epoch 只有新输入或历史上界变化时只重算⑤尾部。epoch 变化时重算③至⑤。有缓存与无缓存的同输入结果相同。缓存项落后于输入时作废 |
| [request-context SPEC 预计算的派生物](../../SPEC.md#预计算的派生物) | 计量结论不缓存、不复用。缓存缺失时从来源重算，结果相同 |
| C-CACHE 闭包规格（线任务 tmp，不入库） | `load` 不核授权，只在 begin 之后调用。`stage` 只写本次事务。登记表的同步代际核对通过后，在同一无 await 的发布段提交暂存。撤代时失效。重叠调用只在槽位修订仍相同时提交。续读要求第一条是 after 加一。缓存分区包含 tenant、PrincipalKey、scope、来源 generation、用途和消费位置 |

本模型补上缓存与登记表代际机制的组合交错。它不替换 request-context 的借用、撤除与租约结算测试，也不替换 contract 的稳定读取与分页校验测试。

## 状态、范围和动作

每个配置包含一个目标（一个租户、一个作用域）、两个本租户主体、一个外租户主体与两次或三次一次性的调用。历史存储是一个 epoch 加行数。一行的内容由 `<<代际, epoch, 序位>>` 标识：同一序位在不同来源集合代际或不同 epoch 下是不同内容。缓存是每主体一个槽位，槽位有修订号。

| 状态变量 | 含义与拥有者 |
| --- | --- |
| `gen`、`withdrawn` | 登记表当前代际与撤除标记。`Replace` 换代，`Withdraw` 撤除，二者都是撤代 |
| `epoch`、`len` | 历史存储的 epoch 与行数。`Append` 加一行，`Compact` 换 epoch 并可缩短 |
| `allowed` | 读取资格权威对每个本租户主体的当前判断。可随时撤销与重授 |
| `cache`、`rev` | 槽位内容与槽位修订。内容是 `[gen, epoch, rows, owner]` 或空 |
| `req[r]` | 每次调用的阶段、主体、借用代际、准入时的真实资格、读到的槽位修订、载入材料、交出的行、本次源读行数、读取时的 epoch 与长度、复用前缀长度、结果与发布时代际 |
| `regressed` | 观察用布尔值，记录提交是否用更旧的计算覆盖了同代际更长或更新的槽位。产品动作不读取它 |

| 动作 | 状态变化与抽象边界 |
| --- | --- |
| `Begin(r, p)` | 核访问租户、登记表是否撤除、读取资格。外租户直接无权。它记录准入时 `allowed[p]` 的真实值，不记录检查是否被跳过 |
| `Load(r)` | 事务读自己的槽位与修订。存储属于借用的代际：该代际撤代之后，调用看到清空的存储，不看到后继代际的提交 |
| `Read(r)` | 历史组的一次读取，抽象为稳定读取协议的一个原子步骤。有同 epoch 的材料时复用其行，只从借用代际的来源读取其后的尾部，否则全读。来源可以交出晚一行开始的页，读取拒绝它，返回无效 |
| `Recheck(r)` | 结果离开操作组之前的最后一次资格观察 |
| `Publish(r)` | 登记表的同步发布段。借用代际不是当前代际时结果为不可用且不提交。否则结果 ok，暂存材料在槽位修订未变时成为槽位内容 |
| `Append`、`Compact` | 历史持有者的追加与压缩。压缩换 epoch，行数变为任意不大于原值的数 |
| `Replace`、`Withdraw` | 登记拥有者的换代与撤除。二者都清空缓存 |
| `Revoke(p)`、`Grant(p)` | 资格权威撤销与重授一个本租户主体的读取资格 |

`Next` 枚举上述动作的任意交错。没有状态裁剪或步数约束。`valid-cache` 对调用集合与本租户主体集合使用对称缩减，`valid-pairs` 与全部负控不用。`CHECK_DEADLOCK FALSE` 允许全部调用结束后的合法静止。本模型只检查安全性质与计数性质，没有时序性质。

## 性质与负控

| 要求 | 检查 | 负控与预期反例 |
| --- | --- | --- |
| S1 撤代之后旧代际的派生物不再发布 | `NoStalePublication` | `bad-publish-check` 删除发布前的代际核对。借用中换代的调用照常交出结果 |
| S1 撤代之后旧代际的派生物不再被使用 | `CacheIsCurrent`、`Equivalence` | `bad-retire-clear` 撤代不清空缓存。新代际的调用复用旧代际的前缀，交出的行混有旧代际内容 |
| S2 每次请求重新核授权，命中不绕过 | `Authorized` | `bad-auth-hit` 槽位已有材料时跳过准入与发布前的资格检查。撤权后的主体靠热缓存取得结果 |
| S2 外主体不能命中 | `HitBelongsToPrincipal` | `bad-shared-key` 槽位键不含主体。同租户另一主体载入他人的材料 |
| S3 稳定层加连续新增尾等于全量重算 | `Equivalence`、`CacheContiguous` | `bad-gap` 续读不要求第一条是 after 加一。来源交出晚一行开始的页时，交出的行缺一行 |
| S3 跨 epoch 不拼接 | `Equivalence` | `bad-epoch` 续读不比较 epoch。压缩之后旧 epoch 的前缀被拼上新 epoch 的尾部 |
| C1 一次请求的源读行数只与新增数有关 | `TailReadBound` | 没有单独负控。`bad-gap` 与 `bad-epoch` 同时使它失败 |
| C2 较晚返回的旧计算不覆盖较新缓存 | `NoRegression` | `bad-overwrite` 提交不比较槽位修订。先读短、后发布的调用覆盖已提交的更长前缀 |

正控还检查 `TypeOK`。`Equivalence` 对命中与缺失一视同仁：无论是否复用前缀，交出的行必须等于按借用代际、读取时 epoch 与长度从来源全量重算的行。`TailReadBound` 要求 `read + prefix = len`，即一次请求的源读行数等于当前长度减去复用前缀的长度。前缀长度是材料提交时的历史长度，所以源读行数等于此后追加的条数 k，与已有总长无关。撤代之后缓存为空，下一次请求允许一次全量。

`TailReadBound` 在正确模型里接近定义：`Read` 就是从前缀之后读到当前上界。模型在这里的价值是检查没有一种交错（读取中追加、重叠提交、读取中撤代、压缩）让交出的行与全量重算不同，同时源读行数仍只覆盖尾部。真实页数与行数由 C-CACHE 的 200 轮确定性计数用例承担，本模型不替代它。

负控各自只改变具名故障开关，不改性质。每个负控 cfg 只声明一个不变量，运行器同时核对 cfg、退出码、不变量名与轨迹标记。语法错误、工具失败和超时均不算检出。

## 模型到设计与实现的映射

C-CACHE 的写者在分支 `PanQiWei/srun-w2-cache` 实现。本节核对的是该分支提交 `99131c3ab` 的已提交内容，其中 `history-read.ts` 与 `input-read.ts` 当时仍有未提交修改。标「对设计」的行只核对 C-CACHE 规格与成员 SPEC，标「对实现」的行另核对了上述提交的源码。

| 模型边界 | 设计或实现入口 | 对应与差异 |
| --- | --- | --- |
| `Begin` 的租户、撤除与资格检查 | [registry.ts](../../src/registry.ts) `borrowed()`，[operations.ts](../../../request-context-contract/src/operations.ts) `begin` | 对实现。登记表先核访问租户与登记存在，再由操作组核资格与主体键。模型把三步合为一个动作，中间没有交错 |
| `Load` 在 begin 之后、不核授权 | C-CACHE 的 `AssemblyReuse.load`，写者的 `operations.ts` 在 `begin` 之后调用 `reuse.load` | 对实现。写者的 `materialBelongs` 另核主体、代际与目标。模型把主体分区放在槽位键上，把代际分区放在「撤代清空」上，不在 `Load` 再核代际 |
| 存储属于借用的代际 | 写者的 `cache.ts` 每个 `Generation` 持有一个 `GenerationCache`，`retire` 调用 `clear()` | 对实现。模型用一个共享存储加撤代清空表示「每代际一个存储且撤代即丢弃」。`Load` 的 `live` 条件表示借用代际撤代之后，事务看不到后继代际的提交。`no-clear-on-retire` 对应把缓存放在登记表级而不按代际分区 |
| `Read` 的同 epoch 续读与首行连续性 | [history-read.ts](../../../request-context-contract/src/history-read.ts) `readHistory` 的 `prefix` 参数与 `validPage` | 对实现。写者的 `start()` 要求同 target、同 epoch、前缀末序位等于前缀依据的上界、本次上界更大。`validPage` 要求第一条是 `after` 加一。模型只建模 epoch 与首行连续性，没有建模上界回退、前缀与其依据不一致、页内缺口与游标 evidence 不同 |
| `Read` 作为一个原子步骤 | [input-read.ts](../../../request-context-contract/src/input-read.ts) `stableGroup` 的计数、读取、计数 | 对设计。稳定读取的两次尝试与 `unstable-input` 不在模型内。模型假设一次读取看到一个一致的 `(epoch, len)` |
| `Recheck` | `operations.ts` 的 `publish` 再次调用 `eligible` | 对实现。它是一次 await，与登记表的同步发布段之间可以有交错，模型照此分为两个动作 |
| `Publish` 的代际核对与提交 | `registry.ts` `borrowed()` 发布段：`item.withdrawn || current.get(item.key) !== item`，然后 `transaction.commit()` | 对实现。写者只在结果是候选、需压缩或装不下时提交，失败不提交。模型把「结果 ok」当作这些成功结局的总和 |
| 槽位修订与重叠提交 | 写者的 `commit()` 比较 `seen` 与槽位当前 `revision`，并比较 `cleared` 计数 | 对实现。模型的修订号在整个运行里单调，不随清空重置。写者的 `cleared` 计数在模型里由发布段的代际核对覆盖 |
| 材料内容 | C-CACHE 的 `CachedAssemblyMaterial` | 对设计。模型只保留历史行、代际、epoch 与主体。提示词渲染、工具声明、快照提醒、分层、内容控制值与完整准备键都没有建模 |
| 每次重新计量与结局 | [RQ-05](../../../request-context-contract/SPEC.md#rq-05-完整预算与候选完成) | 对设计。租约、计量与结局不在模型内。模型的结果 ok 只表示稳定材料交出 |

实现必须满足的动作守卫，按模型的负控逐条对应：

1. 发布段在同一同步步骤里核借用代际仍是当前代际，之后才交出结果与提交暂存。核对与提交之间不能有 await（`bad-publish-check`）。
2. 撤除与替换使该代际的缓存不再被任何新借用读到。按代际持有存储并在 `retire` 丢弃，或在共享存储上按代际分区，二者至少一个（`bad-retire-clear`）。
3. 热路径不省略准入时的资格检查，也不省略发布前的资格再核。`load` 只在 `begin` 通过之后调用（`bad-auth-hit`）。
4. 槽位键至少包含主体键与消费位置。目标与代际由存储归属或键保证（`bad-shared-key`）。
5. 续读的第一页第一行必须等于前缀末序位加一，页内连续，否则按原无效结果返回，不拼接（`bad-gap`）。
6. 前缀的 epoch 与本次依据的 epoch 不同时不续读，走全读（`bad-epoch`）。
7. 提交时比较载入时的槽位修订。修订已变时丢弃本次暂存，结果仍可交出（`bad-overwrite`）。

## 假设与范围

- 历史在同一 epoch 内只追加，长度不回退。上界回退在实现里由 `start()` 处理，模型没有展开。
- 来源的页故障只有一种：第一页晚一行开始。页内缺口、游标依据不同与分页不完整在实现里由 `validPage` 与游标核对处理，模型没有展开。
- 一个目标、一个用途、一个消费位置。租户分区由 `Begin` 的租户检查与每目标一个代际共同表示，模型没有两个目标。
- 三次调用、三行历史、两个 epoch、两个代际。更多调用或更长历史没有运行。
- 没有建模 Model 准备租约、`settled` 结算、`close()`、独立操作组（`generation = null`）、`carried` 路径、`planCompaction` 的判断窗口、稳定层各层的按组失效，以及 200 轮的真实页数。
- 模型的 `Equivalence` 把「全量重算」定义为按借用代际与读取时 `(epoch, len)` 生成的行集合。它不说明投影、可见性、回放或压缩保留语义，这些由 contract 的增量投影等价用例承担。

## 执行

Windows 宿主从工作树根运行。Python 仅使用标准库。TLC 使用任务指定的 WSL Ubuntu-24.04 与 `/opt/tlaplus/tla2tools.jar`。

```bash
export PYTHONUTF8=1
unset UV_DEFAULT_INDEX
python packages/context/request-context/verification/cache/run-models.py --help
python packages/context/request-context/verification/cache/run-models.py --parse-only
python -B packages/context/request-context/verification/cache/test-runner.py
python packages/context/request-context/verification/cache/run-models.py
```

模型检查不占测试名额（线规则，2026-11-03 起）：一次只跑一个配置，工作线程最多 4，堆 2 GiB。运行器先执行负控，再执行正控。可在命令后追加一个或多个 cfg 名称，不含扩展名。`--timeout` 调整单配置预算，默认 600 秒。`--workers` 设置 TLC 工作线程，最多 4。`--output` 只能指定本工作树 `tmp/` 下的证据根目录。

Windows 运行器把模型、配置及自身快照通过标准输入复制到 WSL 的独立 `/tmp/omne-candidate-cache.*`。Java 在该副本运行，TLC 状态文件也留在该副本。证据复制到工作树的 `tmp/line-session-run/w2/M-CACHE/runs/<UTC 时间>/`。正常结束、失败或超时退出后删除 WSL 副本。没有在 `/mnt/d` 安装依赖或运行仓库构建。

每次执行保存输入 SHA-256、源码 HEAD、JAR SHA-256、Java/TLC 版本、完整命令、参数、退出码、状态数和原始日志。正控要求退出 0 且出现完整搜索成功标记。负控要求退出 12、指定不变量及轨迹。未执行配置与工具失败不能记为通过。

## 实测范围

2026-11-03 在 Windows 11 宿主启动 WSL Ubuntu-24.04，使用 Temurin 21.0.12.1、TLC2 2.19（TLA2Tools 1.7.4，revision `5a47802`）。JAR SHA-256 为 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`。模型 `CandidateCache.tla` 的输入 SHA-256 为 `c204fe9c48dd9f8e06cc33c340cb6aa50b8e46d9d8060e6bd615dc4443ee06b7`。参数为 4 个 worker、`-Xmx2048m`、ParallelGC、seed 787、fingerprint polynomial 0，每 cfg 1200 秒预算。常量为两个本租户主体、一个外租户主体、三行历史、两个 epoch、两个代际。

| cfg | 调用数 | 生成状态 / 不同状态 | 深度 | 耗时 | TLC 退出码 | 判读 |
| --- | --- | --- | --- | --- | --- | --- |
| `valid-pairs` | 2 | 4,696,289 / 1,017,408 | 22 | 7 秒 | 0 | 正控九项不变量通过，没有对称缩减 |
| `valid-cache` | 3 | 57,305,241 / 12,272,112 | 27 | 161 秒 | 0 | 正控九项不变量通过，对调用与本租户主体使用对称缩减 |
| `bad-publish-check` | 3 | 28,639 / 10,776 | 7 | 1 秒 | 12 | 借用中换代后照常发布，违反 `NoStalePublication` |
| `bad-retire-clear` | 3 | 7,792,900 / 2,079,186 | 13 | 14 秒 | 12 | 新代际复用旧代际前缀，交出的行混有旧代际内容，违反 `Equivalence` |
| `bad-auth-hit` | 3 | 1,957,098 / 543,419 | 12 | 4 秒 | 12 | 撤权后的主体靠热缓存取得结果，违反 `Authorized` |
| `bad-gap` | 3 | 5,846,622 / 1,546,471 | 13 | 9 秒 | 12 | 续读接受晚一行开始的页，交出的行缺一行，违反 `Equivalence` |
| `bad-shared-key` | 3 | 94,010 / 30,674 | 8 | 1 秒 | 12 | 同租户另一主体载入他人材料，违反 `HitBelongsToPrincipal` |
| `bad-epoch` | 3 | 5,943,334 / 1,583,010 | 13 | 9 秒 | 12 | 压缩后旧 epoch 前缀拼上新 epoch 尾部，违反 `Equivalence` |
| `bad-overwrite` | 3 | 2,862,750 / 766,766 | 12 | 5 秒 | 12 | 先读短、后发布的调用覆盖更长前缀，违反 `NoRegression` |

两个正控日志均包含 `Model checking completed. No error has been found.`，无剩余队列状态。`valid-pairs` 的指纹碰撞估计为乐观 `2.0E-7`、实际 `3.6E-8`。`valid-cache` 为乐观 `3.0E-5`、实际 `2.6E-6`。负控在反例处停止，其状态数不代表完整探索，并随 worker 调度略有变化。负控使用完整的三调用常量，没有对称缩减。

不带对称缩减的三调用正控在 4 分钟内生成 1.24 亿状态、3,160 万不同状态，队列仍在增长，按线负责人的 20 分钟上限停止，没有结论。因此三调用正控采用对称缩减，两调用正控保留无缩减的完整搜索。这些仍是有限模型检查结果，不是数学证明。

原始日志与输入快照位于当次工作树 `tmp/line-session-run/w2/M-CACHE/runs/20261102T163431.113123Z/`，`results.json` 汇总全部九项，完整运行入口退出 0。运行器单测 `test-runner.py` 五项通过。阶段性的模型表达错误（记录与字符串比较、`\/` 与 `=` 的优先级）和被停止的无缩减正控留在闭包证据目录，不进入长期行为声明。
