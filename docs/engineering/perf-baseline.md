# 性能基线：Journal 的写入量

本页记录 Agent Journal 每次提交的写入量，以及它与会话日志的比。它是测量读数和阈值，不是承诺。承诺在 [session-adapters 的 SPEC](../../packages/session/session-adapters/SPEC.md) 与 [session-storage-sql 的 SPEC](../../packages/session/session-storage-sql/SPEC.md)，不变式在 [session-and-run](../architecture/runtime/session-and-run.md)。读数只对表头写明的提交、负载和环境成立。

## 测量什么

每次存储提交，按参加者读出下列项目。

| 读数 | 含义 |
| --- | --- |
| 字节数 | 提交请求里每个 command 的 JSON 文本（UTF-8）字节数。参加者取 command 的 `participant`。 |
| `sl_state` | Session 参加者在事务里整行重写的快照。它不在请求里，所以每次提交后读这一行的大小。 |
| 页数 | 这次提交写进 WAL 的帧数。一帧是一页，页长 4096 字节。 |
| fsync 次数 | 带提交标记的 WAL 帧数。库以 `synchronous=FULL` 打开，每次事务提交同步一次 WAL。这是由配置推出的次数，不是操作系统层的计数。 |
| 每步提交次数 | 一步（一次 Model 调用加它请求的那次 Tool 调用）里的存储提交次数。 |
| 自有字节对 `sl_entry` 字节的比 | 全部 `execution-record` command 的字节和，除以 `sl_entry` 的字节和。 |

一步以 Model 调用被受理为界。第 0 步是建会话与受理输入。最后一次受理（文本答复，不带 Tool）之后的提交记在收尾步。

不被存储接受的提交单列为「被拒」，不计入字节、页数和 fsync。

## 怎样跑

入口是 `apps/harness-server/tests/rows/storage/journal-bytes.spec.ts`。

```sh
cd apps/harness-server
OMNE_JOURNAL_BYTES=20-small-release,20-3k-relaxed \
  pnpm exec vitest run --mode slow --typecheck.enabled=false tests/rows/storage/journal-bytes.spec.ts
```

用例名是「步数-消息档-存储上限」。消息档 `small` 是脚本化小消息，`3k` 是 3 KiB 消息。存储上限 `release` 是发行配置的 1 MiB 单 command 上限，`relaxed` 放开这一上限。`OMNE_JOURNAL_BYTES=all` 跑全部。读数写到 `tmp/journal-bytes/`，库副本写到 `tmp/journal-facts/`。

测量设施的快层测试在 `journal-measure.spec.ts`。字节和 WAL 的读法在 `fixtures/journal-measure.ts`。

世界是 line-through 联合世界：真实的 session-adapters Journal 提供者、真实的 sqlite-provider、真实的 Agent 循环和接收方。Model 与 Tool 是脚本替身，不访问网络。

### 测量的局限

- 页号在运行结束后用 `dbstat` 对到表。运行中被回收再分配给别的表的页，按最终所有者记。
- 提交串行经过包装器。存储写者本来就是单写，所以可见次序不变，但提交之间的重叠时间不测。
- 世界里每步有一次存储没有接受的提交（表中「被拒」列）。原因没有深查。它不写字节。
- 只测一次，没有重复。字节数由负载决定，重复间只差几百字节。时间不测。

## 现状基线

存储是 WIRE 头 `4d5a7e0bc` 的 Journal 提供者：每次发布写写入方 execution 的全部分区（session-adapters 的 K-8）。

### 发行上限（1 MiB 单 command）

| 用例 | 结果 |
| --- | --- |
| 20 步，小消息 | 第 6 次受理时停住。第 1 到 5 步的最大一次发布是 231 / 406 / 580 / 755 / 929 KiB。第 6 步的发布超过 1 MiB，存储拒绝，Run 不结束。 |
| 20 步，3 KiB 消息 | 第 5 次受理时停住。第 1 到 4 步是 282 / 495 / 708 / 921 KiB。 |
| 200 步，小消息与 3 KiB 消息 | 与 20 步相同，停在同一处。200 步用例在现状下跑不到第 6 步。 |

存储拒绝之后写者反复重试，同一发布被拒约 200 次，没有进展。这是现状的失败可见性问题，不是本页的范围。

### 放开上限（看曲线）

放开单 command 上限后，20 步小消息的 Run 能结束。

| 步 | 提交 | 被拒 | 发布 | 自有 KiB | 最大发布 KiB | Session KiB | `sl_state` 行 KiB | 页 | fsync |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 18 | 0 | 9 | 223 | 56 | 33 | 10 | 289 | 18 |
| 1 | 40 | 2 | 32 | 4356 | 231 | 30 | 21 | 1696 | 38 |
| 2 | 39 | 1 | 32 | 9073 | 406 | 31 | 29 | 2915 | 38 |
| 5 | 39 | 1 | 32 | 23233 | 929 | 31 | 53 | 6530 | 38 |
| 10 | 39 | 1 | 32 | 46886 | 1804 | 31 | 93 | 12555 | 38 |
| 20 | 39 | 1 | 32 | 94331 | 3559 | 31 | 174 | 24612 | 38 |
| 21（收尾） | 19 | 0 | 15 | 47520 | 3891 | 18 | 176 | 12456 | 19 |

3 KiB 消息档，同一用例：

| 步 | 提交 | 被拒 | 发布 | 自有 KiB | 最大发布 KiB | Session KiB | `sl_state` 行 KiB | 页 | fsync |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 18 | 0 | 9 | 315 | 68 | 39 | 10 | 317 | 18 |
| 1 | 40 | 2 | 32 | 5342 | 282 | 36 | 21 | 1956 | 38 |
| 2 | 39 | 1 | 32 | 11103 | 495 | 37 | 29 | 3428 | 38 |
| 5 | 39 | 1 | 32 | 28398 | 1135 | 37 | 53 | 7849 | 38 |
| 10 | 39 | 1 | 32 | 57274 | 2203 | 37 | 93 | 15166 | 38 |
| 20 | 39 | 1 | 32 | 115167 | 4344 | 37 | 174 | 29843 | 38 |
| 21（收尾） | 19 | 0 | 15 | 57932 | 4697 | 21 | 176 | 15083 | 19 |

200 步，小消息，放开上限：Run 在第 50 次受理时以 `failed` 结束，原因没有记到。第 1 到 49 步完整。第 5 / 20 / 50 步的最大一次发布是 929 KiB / 3.5 MiB / 9.2 MiB。累计自有字节约 5.7 GiB，`sl_entry` 约 2.5 MiB。

### 读数的含义

- 最大一次发布随步数线性增长：约 56 KiB 加每步 175 KiB。累计自有字节因此是步数的二次函数。
- 每步 39 次提交，其中 Journal 发布 32 次，fsync 38 次。终态设计的目标是每步 7 到 10 次提交。
- 每步约 1.2 万页（20 步时约 2.5 万页，约 96 MiB 的 WAL 写入）。页主要落在 `er_state_part`。
- Journal 自有字节对 `sl_entry` 字节的比：20 步小消息 946，3 KiB 消息 1037。负载内容变大时比值几乎不变，因为自有字节主要是被整份重写的状态。
- `sl_state` 行随步数增长：每步约 8 KiB，第 20 步 174 KiB。session-storage-sql 的 SPEC 写明它只物化未结状态，大小不随历史增长。这一读数与那句话不符。这个差距归 Session 线，本页只报告读数。
- Session 自己的字节（`Session KiB`）每步约 31 KiB，不随步数增长。

## 守卫与阈值

| 守卫 | 判据 | 状态 |
| --- | --- | --- |
| 最大发布有界 | 第 20 步的最大一次发布 ≤ 第 5 步 + 2 KiB | 现状下红。用例标 skip，终态 provider 合入后启用（R2-D294）。 |
| 累计自有字节线性 | 累计自有字节 ≤ J0 + W × 步数。J0 初值 64 KiB，W 初值 12 KiB 每步 | 现状下红。同上。 |
| 比值 | 比值 > 1.0 告警，不失败 | 现状 946 / 1037。 |
| 事实体无内容键 | `er_fact.body` 里没有 `role`、`content`、`messages`、`system` | `er_fact` 表不存在时跳过。入口是 `pnpm run check:journal-facts`。 |

W 与 J0 是第一版初值。终态 provider 合入后重测，J0 取实测值，W 取实测值加 25% 余量，再回写本页。

现状下红的读数就是上表：第 5 步最大一次发布 929 KiB，第 20 步 3559 KiB，差 2630 KiB，界是 2 KiB。判据本身的负控在 `journal-measure.spec.ts`：它对合成曲线和这条实测曲线都判红。

## 没有覆盖的

- 终态 provider 的读数。它合入后在同一入口重测，并替换本页的现状表。
- 真实 Model 与 Tool、真实编码轮的负载。脚本负载的比值不能推到真实负载。
- 时间、内存、读放大。本页只测写入。
- Postgres。读数只对 SQLite 的 WAL 成立。
