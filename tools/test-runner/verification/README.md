# 令牌池的形式验证

[CoreTokenPool.tla](models/CoreTokenPool.tla) 是整机令牌池（`scripts/with-test-slot.mjs`）的有限状态模型。令牌池的规则与用法归 [test-runner 的规格](../SPEC.md)「令牌池」一节；本页只说模型覆盖什么、怎样跑、怎样判读。模型不执行脚本，也不证明脚本符合模型。

## 模型的范围

三个进程，容量 C 取 2 或 3，每个进程提一次请求：`want` 在 1..C 里任取，`min` 取配置给的值且不大于 `want`。任何进程在任何时刻都可能死掉（`crash`），它的文件留在原处。

抽象：

- 「失效」抽象成「登记它的进程死了」。心跳间隔、同侧按进程号判、对侧只看心跳，都并进这一个判断；活着的登记不会被判失效（不建模时钟偏差，也不建模队列锁停留超过 30 秒被当作失效）。
- 一次 `takeTurn` 是一个原子步：领票、数前面的活票、拿令牌在同一步完成。它之前必须先把看得见的失效文件判完、删完。
- 判失效与按路径删除是分开的两步（`alive_judge`、`remove`），队列锁的「判主人已死」与「按路径删锁」也是两步（`inQueue` 的 `gone` 分支、`removeQueueLock`）。代码里这两处都是先读、再按路径删，中间别的进程可以插进来。

## 动作与代码的对应

| 模型动作 | `scripts/with-test-slot.mjs` |
| --- | --- |
| `request(p)` | 进程启动，解析 `--want`、`--min` |
| `inQueue(p)` | `inQueue`：`mkdir queue.lock` 成功并写 `owner`；或锁已在、`owner` 同侧且进程不在（`gone`） |
| `removeQueueLock(p)` | `removeQueueLock`：离开时只删 `owner` 仍是自己的锁；`gone` 之后按路径删锁 |
| `alive_judge(p)`、`remove(p)` | `alive`：读登记、判失效；`remove`：按路径删 |
| `takeTurn(p)` | `takeTurn`：领票（目录里最大票号加 1）、数前面的活票、作为队首在空闲数不少于 `min` 时拿 `min(want, 空闲数)` 个、删自己的票 |
| `run(p)` | `run`：被包装的命令结束 |
| `releaseTokens(p)` | 归还：在队列锁里对自己的每个令牌文件 `removeOwn` |
| `crash(p)` | 进程被杀；文件留下 |

公平性：每个活进程的步骤弱公平；拿队列锁强公平（锁只占很短时间，轮询的等待者终会看到它空着）。

## 性质

| 编号 | 模型里的写法 | 种类 |
| --- | --- | --- |
| P1 不超卖 | 活着的进程自认持有的（进程，令牌）对数不超过 C | 不变式 |
| P2 不重复 | 两个活进程自认持有的令牌不相交 | 不变式 |
| P3 不漏 | 有活着的等待者时，死进程的令牌文件终被删掉（或者不再有活着的等待者） | 活性 |
| P4 先来先得 | 有号码更小的活票在排队时，没有进程拿到令牌 | 动作性质 |
| P5 不让资源闲着 | 活着的队首在空闲数不少于它的 `min` 时，终会拿到令牌或死掉 | 活性 |

P1、P2 看的是进程「自认持有」的集合，不是目录里的文件，所以一个被误删又被别人重建的令牌文件会显成重复持有。

## 配置与期待结果

| 配置 | 内容 | 期待 |
| --- | --- | --- |
| `positive-c2-nolockcrash` | C = 2，`min` = 1；队列锁的持有者不死 | P1 到 P5 成立 |
| `safety-c3-nolockcrash` | C = 3，`min` = 1 | P1、P2、P4 成立 |
| `safety-min2-nolockcrash` | C = 3，`min` 取 1 或 2 | P1、P2、P4 成立 |
| `live-min2-c2-nolockcrash` | C = 2，`min` 取 1 或 2 | P3、P5 成立（P5 按队首自己的 `min`） |
| `negative-no-lock` | 去掉队列锁 | P2 被违反：两个进程都判同一个令牌失效，一个删了重拿，另一个按路径删掉了它的新文件 |
| `negative-no-head` | 去掉队首限制 | P4 被违反 |
| `negative-no-reap`、`negative-no-reap-p5` | 去掉过期清理 | P3 被违反；P5 被违反（死进程的令牌一直占着，队首永远拿不到） |
| `finding-lock-steal-c2` | 与正控相同，但队列锁的持有者也会死 | P1 被违反，见下节 |

## 未解决的发现：队列锁的回收不是原子的

队列锁的持有者在锁里死掉时，`finding-lock-steal-c2` 给出 P1、P2 的反例（19 步）：p1 拿到令牌 1 后在锁里死掉；p2、p3 都在 `inQueue` 里判它 `gone`；p2 删锁、重建锁；p3 再按路径删掉 p2 的锁并建自己的锁，于是 p2、p3 同时在锁里；两者都判令牌 1 失效，p2 删掉、拿到令牌 1，p3 再按路径删掉 p2 的令牌 1 并拿走两个令牌。结果 p2 与 p3 都自认持有令牌 1。

持有者不在锁里死掉时（`*-nolockcrash`），P1 到 P5 都成立；所以缺口只在回收死锁这一步。代码里同样的先读后删也出在「队列锁停留超过 30 秒算失效」：持有者被挂起超过 30 秒时，它的锁会被活着的时候删掉。修好之后，`finding-lock-steal-c2` 改成正控。

## 执行与判读

环境要 Python 3、Java 与 tla2tools 1.7.4。`TLA2TOOLS_JAR` 设为 JAR 的绝对路径，必要时设 `JAVA_BIN`。

```sh
python3 tools/test-runner/verification/check.py            # 全部配置
python3 tools/test-runner/verification/check.py negative-no-head   # 只跑点名的配置
python3 tools/test-runner/verification/check.py --self-test
```

[清单](models.json) 写着每个配置的期待结果。[执行器](check.py) 每个配置用两个 worker、1 GiB 堆、30 分钟期限。正控要退出 0 并有完成标志；不变式负控要退出 12 并点名不变式；动作性质负控要退出 13 并点名性质；时序负控要退出 13 并有循环或停滞的反例，TLC 不点名被违反的时序性质，所以每个时序负控的配置只列一条性质。解析错误、点名不对、超时都不算通过。输出写进仓库 `tmp/formal/test-runner/<时间-进程>/`，带命令、日志、输入哈希、Git head、JAR 哈希与 Java 版本。负控的「passed」表示检出了预期的缺陷。

这个入口没有接进 `pnpm run check`。改 `with-test-slot.mjs` 的票、锁、令牌或回收规则时，先改模型再改代码，并重跑全部配置。
