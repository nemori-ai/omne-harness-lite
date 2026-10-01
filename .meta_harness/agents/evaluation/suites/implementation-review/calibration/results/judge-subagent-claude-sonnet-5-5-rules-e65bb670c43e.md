# 判官校准：implementation-review

判官：`judge:subagent:claude-sonnet-5-5 rules e65bb670c43e`（以 subagent 派发；宿主记录的档位：medium）
人工判定：人工：主会话。真实报告依 2026-10-01 试派记录的逐条判定；做出来的反例按它被删改的内容判

7 份报告，已判 7 份，判官答复没通过核对的 0 份，还没判的 0 份；共 7 次派发。

## 逐处问题的一致情况

| | 判官：报出了 | 判官：没报出 |
|---|---|---|
| 人工：报出了 | 26 | 0 |
| 人工：没报出 | 0 | 16 |

一致 42 / 42（100.0%）。

## 每份报告

| 报告 | 种类 | 材料 | 人工：报出 | 判官：报出 | 不一致的问题 | 派发次数 |
|---|---|---|---|---|---|---|
| `trial-r1` | 真实报告 | `session-tenancy-delivery` | 6 / 6 | 6 / 6 | 无 | 1 |
| `cut-I4-I1` | 反例：删掉两条发现 | `session-tenancy-delivery` | 4 / 6 | 4 / 6 | 无 | 1 |
| `demoted-I5` | 反例：发现挪到「未覆盖」 | `session-tenancy-delivery` | 5 / 6 | 5 / 6 | 无 | 1 |
| `note-silent` | 反例：只删掉对交付说明的指认 | `session-tenancy-delivery` | 5 / 6 | 5 / 6 | 无 | 1 |
| `taste-added` | 反例：加一条品味意见 | `session-tenancy-delivery` | 6 / 6 | 6 / 6 | 无 | 1 |
| `no-findings` | 反例：没有发现 | `session-tenancy-delivery` | 0 / 6 | 0 / 6 | 无 | 1 |
| `off-topic` | 反例：答非所问 | `session-tenancy-delivery` | 0 / 6 | 0 / 6 | 无 | 1 |

## 不一致的问题

无。

## 运行级的三个计数

| 报告 | 指标 | 人工 | 判官 | 一致 | 判官的依据 |
|---|---|---|---|---|---|
| `trial-r1` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `trial-r1` | blocking | 4 | 4 | 是 | 1（读不到存储被答成 sessionNotFound，违背契约 S-7/S-15）；2（既有断言被改弱，且一条既有用例被 skip）；3（新增依赖方向违规，group-direction 规则报红）；4（越出写入范围，改了 session-log-jsonl 的说明，与交付说明不符） |
| `trial-r1` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `cut-I4-I1` | blocking | 2 | 2 | 是 | 阻断 1（存储读不到时 reader.ts 答 sessionNotFound，违背契约 S-7/S-15）；阻断 2（既有断言由 unavailable 改成 sessionNotFound，另一条既有用例被 test.skip，与交付说明相反） |
| `demoted-I5` | blocking | 4 | 4 | 是 | 阻断 1（存储读不到时答 sessionNotFound，违背契约 S-7/S-15）；阻断 2（既有断言被改弱为 sessionNotFound，另有一条用例被 test.skip）；阻断 3（领域包直接依赖 infra 的 storage-sql，group-direction 报红）；阻断 4（改动了写入范围外的 session-log-jsonl README_ZH.md，与交付说明不符） |
| `note-silent` | blocking | 4 | 4 | 是 | 1（读不到存储被答成 sessionNotFound，违背契约 S-7/S-15）；2（既有断言由 unavailable 改为 sessionNotFound，另一条既有用例被 test.skip）；3（领域包直接依赖 infra storage-sql，group-direction 报红）；4（改动了写入范围外的 session-log-jsonl/README_ZH.md） |
| `taste-added` | out_of_kind | 1 | 1 | 是 | 非阻断 8（describeHoldingTenant 的命名与嵌套三元写法可以更讲究） |
| `taste-added` | blocking | 4 | 4 | 是 | 阻断 1（存储读不到时被答成 sessionNotFound，违背契约 S-7、S-15，并给出反例与消费者后果）；阻断 2（既有断言由 unavailable 改成 sessionNotFound，另有一条既有用例被 test.skip，且与交付说明相反）；阻断 3（新增依赖方向违规：领域包直接依赖 infra 的 storage-sql，规则检查 group-direction 报红）；阻断 4（改动了写入范围之外的 session-log-jsonl 说明文件，与交付说明不符） |
| `taste-added` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `no-findings` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `no-findings` | blocking | 0 | 0 | 是 | 没有阻断发现 |
| `no-findings` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
