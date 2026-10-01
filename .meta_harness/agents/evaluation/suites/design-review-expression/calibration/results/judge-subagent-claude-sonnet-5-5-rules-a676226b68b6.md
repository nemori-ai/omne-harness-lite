# 判官校准：design-review-expression

判官：`judge:subagent:claude-sonnet-5-5 rules a676226b68b6`（以 subagent 派发；宿主记录的档位：medium）
人工判定：人工：主会话。真实报告依 2026-10-01 对照记录的逐条判定；做出来的反例按它被删改的内容判

8 份报告，已判 8 份，判官答复没通过核对的 0 份，还没判的 0 份；共 9 次派发。

## 逐处问题的一致情况

| | 判官：报出了 | 判官：没报出 |
|---|---|---|
| 人工：报出了 | 49 | 0 |
| 人工：没报出 | 0 | 23 |

一致 72 / 72（100.0%）。

## 每份报告

| 报告 | 种类 | 材料 | 人工：报出 | 判官：报出 | 不一致的问题 | 派发次数 |
|---|---|---|---|---|---|---|
| `merge-old-r1` | 真实报告 | `raf-contract` | 9 / 9 | 9 / 9 | 无 | 1 |
| `merge-old-r2` | 真实报告 | `raf-contract` | 8 / 9 | 8 / 9 | 无 | 1 |
| `merge-new-r1` | 真实报告 | `raf-contract` | 9 / 9 | 9 / 9 | 无 | 1 |
| `merge-new-r2` | 真实报告 | `raf-contract` | 9 / 9 | 9 / 9 | 无 | 1 |
| `cut-E6-E8` | 反例：删掉两条发现 | `raf-contract` | 7 / 9 | 7 / 9 | 无 | 2 |
| `demoted-E1-E9` | 反例：发现挪到「未覆盖」 | `raf-contract` | 7 / 9 | 7 / 9 | 无 | 1 |
| `no-findings` | 反例：没有发现 | `raf-contract` | 0 / 9 | 0 / 9 | 无 | 1 |
| `off-topic` | 反例：答非所问 | `raf-contract` | 0 / 9 | 0 / 9 | 无 | 1 |

## 不一致的问题

无。

## 运行级的三个计数

| 报告 | 指标 | 人工 | 判官 | 一致 | 判官的依据 |
|---|---|---|---|---|---|
| `merge-new-r1` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `merge-new-r1` | blocking | 7 | 7 | 是 | B-1（S-9 ⑤ 允许 runEnded 省略只答 superseded，与 S-8 两件事实一起答出或一起不答冲突）；B-2（S-12 撤除时在途的读按「仍是当前、尚未终结」处置，给出过渡值，与 S-8 冲突）；B-3（S-9 ① session 缺省取当前会话，与 S-8 缺一即 invalidInput 冲突）；B-4（S-9 ⑥ 其他错误由提供者自定，失败集合未闭合）；B-5（S-7 第 2 条把 ctx.inject/ctx.serial 机制写进条款，并与 S-10 等冲突）；B-6（进展性质声称经 TLC 检查，但 S-13 不建模、无 formal task）；B-7（状态与版本的说法互相矛盾（已接受、候选、首版、v1 接受记录）） |
| `merge-new-r1` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `merge-new-r2` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `merge-new-r2` | blocking | 8 | 8 | 是 | B1（S-9 ① 的 session 带默认值，与 S-8 缺一即 invalidInput 冲突）；B2（S-9 ⑤ 允许 runEnded 省略，成功返回只答一半，与 S-8 冲突）；B3（S-9 ⑥ 的“其他错误由提供者自定”使失败集合没有收口）；B4（S-12 撤除时在途读按“仍是当前、尚未终结”处置，与 S-8/S-9 及消费者契约冲突）；B5（S-7 第 2 条把 ctx.inject/ctx.serial 等 Cordis 机制和无主事件写进契约）；B6（进展性质第一行声称已由 TLC 检查，但契约写明不建形式模型）；B7（页首状态与版本血缘写错：写已接受、首版，实为 candidate 且有 v1）；B8（设计依据 PF-012 rev 14 已过期，当前为 rev 21） |
| `merge-new-r2` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `cut-E6-E8` | blocking | 5 | 5 | 是 | B-2（S-12 撤除时在途的读按「仍是当前、尚未终结」处置,是过渡值,与 S-8 和 S-9 ⑧ 的禁令冲突）；B-3（S-9 ① 给 session 设了缺省值,与 S-8 身份参数缺一即 invalidInput 冲突）；B-4（S-9 ⑥「其他错误由提供者自定」使失败集合开放,与 S-8 总表及闭合枚举冲突,判定次序也不成全序）；B-5（S-7 第 2 条把 ctx.inject、ctx.serial 与服务键写进契约,且与 S-10 不发事件冲突）；B-7（契约、catalog、验证入口对已接受还是候选以及首版的说法互相矛盾） |
| `demoted-E1-E9` | blocking | 7 | 7 | 是 | B-1（S-9 ⑤ 允许 runEnded 省略只答一半，与 S-8、G-3、§十一冲突）；B-2（S-12 撤除时在途的读按「仍是当前、尚未终结」处置，给出过渡值）；B-3（S-9 ① 给 session 设默认值，与 S-8 冲突）；B-4（S-9 ⑥ 失败集合开放式收尾，判定次序不成全序）；B-5（S-7 第 2 条把 inject/serial 机制写进条款，并与 S-10、session-log S-20 冲突）；B-6（进展性质声称 TLC 检查，但 S-13 与验证入口说不建模）；B-7（契约、catalog、验证入口对状态与版本血缘的说法互相矛盾） |
| `no-findings` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `no-findings` | blocking | 0 | 0 | 是 | 没有阻断发现 |
| `no-findings` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |

## 判官的答复被程序驳回、重答之后通过的

- `cut-E6-E8`：E1: the sentence the judge rests on is not in the report: '第 95 行「见 S-39」,本契约只定义到 S-18。'
