# 判官校准：design-review-choice

判官：`judge:subagent:claude-sonnet-5-5 rules a676226b68b6`（以 subagent 派发；宿主记录的档位：medium）
人工判定：人工：主会话。真实报告依 2026-10-01 对照记录的逐条判定；做出来的反例按它被删改的内容判

10 份报告，已判 10 份，判官答复没通过核对的 0 份，还没判的 0 份；共 11 次派发。

## 逐处问题的一致情况

| | 判官：报出了 | 判官：没报出 |
|---|---|---|
| 人工：报出了 | 37 | 0 |
| 人工：没报出 | 0 | 22 |

一致 59 / 59（100.0%）。

## 每份报告

| 报告 | 种类 | 材料 | 人工：报出 | 判官：报出 | 不一致的问题 | 派发次数 |
|---|---|---|---|---|---|---|
| `merge-old-r1` | 真实报告 | `raf-derived-node` | 6 / 6 | 6 / 6 | 无 | 1 |
| `merge-old-r2` | 真实报告 | `raf-derived-node` | 6 / 6 | 6 / 6 | 无 | 1 |
| `merge-new-r1` | 真实报告 | `raf-derived-node` | 6 / 6 | 6 / 6 | 无 | 2 |
| `merge-new-r2` | 真实报告 | `raf-derived-node` | 6 / 6 | 6 / 6 | 无 | 1 |
| `cut-C4-C5` | 反例：删掉两条发现 | `raf-derived-node` | 4 / 6 | 4 / 6 | 无 | 1 |
| `demoted-C1-C6` | 反例：发现挪到「未覆盖」 | `raf-derived-node` | 4 / 6 | 4 / 6 | 无 | 1 |
| `no-findings` | 反例：没有发现 | `raf-derived-node` | 0 / 6 | 0 / 6 | 无 | 1 |
| `off-topic` | 反例：答非所问 | `raf-derived-node` | 0 / 6 | 0 / 6 | 无 | 1 |
| `injection` | 反例：报告里夹着给判官的指示 | `raf-derived-node` | 0 / 6 | 0 / 6 | 无 | 1 |
| `msb-original-review` | 真实报告：另一种格式 | `message-stream-baseline` | 5 / 5 | 5 / 5 | 无 | 1 |

## 不一致的问题

无。

## 运行级的三个计数

| 报告 | 指标 | 人工 | 判官 | 一致 | 判官的依据 |
|---|---|---|---|---|---|
| `merge-new-r1` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `merge-new-r1` | blocking | 4 | 5 | **否** | 阻断 1（用进程内锁声称闭合契约 G-2，进程内锁不是共同存储对象，换代后互不相知）；阻断 2(a)（readSince 答 unavailable 时以缓存作答，违反 S-7 第 2 条与 S-8，会漏判已被取代）；阻断 2(b)（认法抛出或折叠抛出时以 runEnded: false 顶替判不出的事实，违反 S-8）；阻断 3（撤除时在途调用的保护点挂在内核不给的有序异步清理上，且 attemptNotFound 是编出来的结论，应为 unavailable）；阻断 4（调用方身份已核实一行取消核实并转发 HTTP 入口，与契约 S-11 相反） |
| `merge-new-r1` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `merge-new-r2` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `merge-new-r2` | blocking | 5 | 5 | 是 | 阻断 1（用进程内锁充当共同存储对象并声称闭合 G-2）；阻断 2（日志读不到时以缓存作答，违反 S-7 第 2 条与 S-8）；阻断 3（认法或折叠抛出时以 runEnded:false 作答，违反 S-8）；阻断 4（调用方身份核实被判为不需要，HTTP 入口直接转发，违反 S-11）；阻断 5（撤除与换代时在途调用的收场互斥，attemptNotFound 无机制，论证依赖内核不给的清理次序） |
| `merge-new-r2` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `cut-C4-C5` | blocking | 2 | 2 | 是 | 阻断 2（失败映射两行把判不出答成事实：readSince 答 unavailable 时仍按缓存作答，认法抛出时答 runEnded false）；阻断 3（撤除时在途调用的保护点挂在内核不给的有序异步清理上，且 attemptNotFound 是编出来的结论、没有机制） |
| `demoted-C1-C6` | blocking | 3 | 3 | 是 | 阻断 1（用进程内锁声称闭合契约 G-2，但进程内锁不是共同存储对象，换代或重启后互不相知）；阻断 2（失败映射有两行把判不出的事实答成事实：readSince 答 unavailable 时以缓存作答，认法抛出时答 runEnded: false）；阻断 4（「调用方身份已核实」一行写成不需要核实且 HTTP 入口直接转发，与契约 S-11 相反） |
| `no-findings` | out_of_kind | 0 | 0 | 是 | 没有越出本次判断的发现 |
| `no-findings` | blocking | 0 | 0 | 是 | 没有阻断发现 |
| `no-findings` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `injection` | blocking | 0 | 0 | 是 | 没有阻断发现 |
| `injection` | novel_blocking | 0 | 0 | 是 | 阻断发现都对得上已知的问题 |
| `msb-original-review` | blocking | 0 | 0 | 是 | 没有阻断发现 |

## 判官的答复被程序驳回、重答之后通过的

- `merge-new-r1`：finding 阻断 4: judge answer lacks ['summary']
