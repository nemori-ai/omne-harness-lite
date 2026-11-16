# 令牌池的形式验证

[CoreTokenPool.tla](models/CoreTokenPool.tla) 是整机令牌池（`scripts/with-test-slot.mjs`）的有限状态模型。令牌池的规则与用法归 [test-runner 的规格](../SPEC.md)「令牌池」一节；本页只说模型覆盖什么、怎样跑、怎样判读。模型不执行脚本，也不证明脚本符合模型。

## 模型的范围

三个进程，容量 C 取 2 或 3，每个进程提一次请求：`want` 在 1..C 里任取，`min` 取配置给的值且不大于 `want`。任何进程在任何时刻都可能死掉（`crash`），它的文件留在原处。

抽象：

- 「失效」抽象成「登记它的进程死了」。心跳间隔、同侧按进程号判、对侧只看心跳、队列锁的条目停留超过 30 秒，都并进这一个判断；活着的登记不会被判失效（不建模时钟偏差，也不建模活着却停留超过 30 秒的锁持有者）。
- 条目名每次新取、永不重用，死进程不再建条目，所以模型里一个条目由它的登记者代表；按确切名字删条目就是只删那个登记者的条目。
- 一次 `takeTurn` 是一个原子步：领票、数前面的活票、拿令牌在同一步完成。它之前必须先把看得见的失效登记判完、删完。代码里它也是在队列锁里一趟做完。
- 判失效与删除是分开的两步（`alive_judge`、`remove`；`inQueue_judge`、`reap`）；取锁是三步（`enter_mkdir`、`enter_place`、`enter_check`）；放锁与回收之后的删空目录是 `removeIfEmpty`，它删的是此刻在那个路径上的目录，不论是谁建的。每两步之间别的进程都可以插进来。

## 动作与代码的对应

| 模型动作 | `scripts/with-test-slot.mjs` |
| --- | --- |
| `request(p)` | 进程启动，解析 `--want`、`--min` |
| `enter_mkdir(p)` | `enter`：`mkdir queue.lock`（原子） |
| `enter_place(p)` | `enter`：在此刻路径上的目录里独占创建自己的新条目；目录已不在（`ENOENT`）就从头来 |
| `enter_check(p)` | `enter`：目录里只有自己的条目才算持有；否则 `leave` 后从头来 |
| `inQueue_judge(p)` | `inQueue`：`mkdir` 遇到目录已在，判某个条目的登记者已死；或目录没有条目而建它的进程已死 |
| `reap(p)` | `reap`：按判死的那个确切名字删条目（`ExactReap = FALSE` 时按旧做法整个按路径删锁） |
| `removeIfEmpty(p)` | `removeIfEmpty`：`rmdir`，目录有条目时不成功 |
| `leave(p)` | `leave`：删自己的条目（随后 `removeIfEmpty`） |
| `alive_judge(p)`、`remove(p)` | `tokenHolder` 与 `takeTurn` 里的 `alive`：读令牌条目或票、判失效；令牌按确切的条目名删，票按路径删（票只在锁里增删） |
| `takeTurn(p)` | `takeTurn`：领票（目录里最大票号加 1）、数前面的活票、作为队首在空闲数不少于 `min` 时拿 `min(want, 空闲数)` 个、删自己的票 |
| `run(p)` | `run`：被包装的命令结束 |
| `releaseTokens(p)` | `releaseTokens`：在队列锁里对自己的每个令牌条目 `leave` |
| `crash(p)` | 进程被杀；条目与文件留下 |

公平性：每个活进程的步骤弱公平；建队列锁目录强公平（锁只占很短时间，轮询的等待者终会看到它空着）。

## 性质

| 编号 | 模型里的写法 | 种类 |
| --- | --- | --- |
| 锁互斥 `LockExclusive` | 至多一个活进程在队列锁里 | 不变式 |
| P1 不超卖 | 活着的进程自认持有的（进程，令牌）对数不超过 C | 不变式 |
| P2 不重复 | 两个活进程自认持有的令牌不相交 | 不变式 |
| P3 不漏 | 有活着的等待者时，死进程的令牌条目终被删掉（或者不再有活着的等待者） | 活性 |
| P4 先来先得 | 有号码更小的活票在排队时，没有进程拿到令牌 | 动作性质 |
| P5 不让资源闲着 | 活着的队首在空闲数不少于它的 `min` 时，终会拿到令牌或死掉 | 活性 |

P1、P2 看的是进程「自认持有」的集合，不是目录里的条目，所以一个被误删又被别人重建的令牌会显成重复持有。

## 配置与期待结果

| 配置 | 内容 | 期待 |
| --- | --- | --- |
| `safety-c2-lockcrash` | C = 2，`min` = 1；进程在取锁、持锁、放锁的任何一步都可能死 | 锁互斥、P1、P2、P4 成立 |
| `positive-c2-nolockcrash` | C = 2，`min` = 1；队列锁的持有者不死 | P1 到 P5 成立 |
| `safety-c3-nolockcrash` | C = 3，`min` = 1 | P1、P2、P4 成立 |
| `safety-min2-nolockcrash` | C = 3，`min` 取 1 或 2 | P1、P2、P4 成立 |
| `live-min2-c2-nolockcrash` | C = 2，`min` 取 1 或 2 | P3、P5 成立（P5 按队首自己的 `min`） |
| `negative-no-lock` | 去掉队列锁 | P2 被违反：两个进程都判同一个令牌失效，一个删了重拿，另一个按路径删掉了它的新文件 |
| `negative-no-head` | 去掉队首限制 | P4 被违反 |
| `negative-no-reap`、`negative-no-reap-p5` | 去掉过期清理 | P3 被违反；P5 被违反（死进程的令牌一直占着，队首永远拿不到） |
| `finding-lock-steal-c2` | 队列锁的持有者会死，回收用旧做法（`ExactReap = FALSE`：按路径整个删锁与令牌文件） | P1 被违反，见下节 |
| `negative-no-sole-entry` | 队列锁的持有者会死，取锁不核「只有自己的条目」（`SoleEntry = FALSE`） | 锁互斥被违反，见下节 |

## 回收为什么要按确切的条目删、取锁为什么要核只有自己的条目

旧做法回收死锁是「读 owner、判死、按路径删整个锁」三步。`finding-lock-steal-c2` 给出它的反例（19 步）：p1 拿到令牌 1 后在锁里死掉；p2、p3 都判它已死；p2 删锁、重建锁；p3 再按路径删掉 p2 的活锁并建自己的锁，于是 p2、p3 同时在锁里；p3 再按路径删掉 p2 刚拿到的令牌 1。p2 与 p3 都自认持有令牌 1。

现在的做法：持有 = 目录里有自己的条目；回收只删判死的那个确切条目，再 `rmdir`，`rmdir` 删不掉有条目的目录。只有这两条还不够：p3 回收 p1 时的 `rmdir` 可能删掉 p2 刚 `mkdir`、还没放条目的空目录；p2 随后把条目放进第三个进程新建的同名目录，两边都放了条目。`negative-no-sole-entry` 给出这条路径。所以 `enter` 放好条目后再核目录里只有自己的条目，看见别的条目就退出重来；两边都放了条目时至少一边看见两个。

模型不覆盖「活着却在锁里停留超过 30 秒」的持有者：它的条目会被当作失效删掉，它自己仍以为持有锁。

## 执行与判读

环境要 Python 3、Java 与 tla2tools 1.7.4。`TLA2TOOLS_JAR` 设为 JAR 的绝对路径，必要时设 `JAVA_BIN`。

```sh
python3 tools/test-runner/verification/check.py            # 全部配置
python3 tools/test-runner/verification/check.py negative-no-head   # 只跑点名的配置
python3 tools/test-runner/verification/check.py --self-test
```

[清单](models.json) 写着每个配置的期待结果。[执行器](check.py) 每个配置用一个 worker、1 GiB 堆、30 分钟期限。正控要退出 0 并有完成标志；不变式负控要退出 12 并点名不变式；动作性质负控要退出 13 并点名性质；时序负控要退出 13 并有循环或停滞的反例，TLC 不点名被违反的时序性质，所以每个时序负控的配置只列一条性质。解析错误、点名不对、超时都不算通过。输出写进仓库 `tmp/formal/test-runner/<时间-进程>/`，带命令、日志、输入哈希、Git head、JAR 哈希与 Java 版本。负控的「passed」表示检出了预期的缺陷。

这个入口没有接进 `pnpm run check`。改 `with-test-slot.mjs` 的票、锁、令牌或回收规则时，先改模型再改代码，并重跑全部配置。
