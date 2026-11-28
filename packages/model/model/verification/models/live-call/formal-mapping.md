# LiveCall：一次 live 调用的生命周期

本目录的模型检查包组规格的五条承诺（「[不变式](../../../../SPEC.md#不变式)」的 MD-56 到 MD-60），规则在规格的「[live 调用](../../../../SPEC.md#live-调用)」。模型只证明列出的有限状态，不证明实现。

## 1. 建模的对象

一次 live 调用，从受理到消费者收到它的结果。模型里有三方：Model（耐久事实加一个会丢的活体）、上游、消费者。

| 变量 | 归谁 | 含义 |
| --- | --- | --- |
| `phase` | Model，耐久 | 阶段：已受理、开着、关闭中、已收场。「连接中」是派生的：已受理、发送状态不是未发出、连接在 |
| `outcome` | Model，耐久 | 结局：完成、被中断、失败。失败带成因：`start` 是会话没开起来，`stream` 是连接断了或期限到了，`runtime` 是活体丢了 |
| `send` | Model，耐久 | 发送状态：未发出、可能已发出、已发出 |
| `cancelIntent`、`endIntent` | Model，耐久 | 取消与正常结束两种控制意图 |
| `closedSeen`、`usageKnown` | Model，耐久 | 见没见过上游的关闭事件；用量知不知道 |
| `through` | Model，耐久 | 收场时事件编到了第几号；`-1` 是未知 |
| `body`、`conn`、`tried`、`connected`、`closeFor` | 活体 | 活体在不在；连接；这个活体记没记过要发、连没连过；这次关闭是为取消还是为正常结束 |
| `tab` | 活体 | 命令表：没见过、排着、送了、上游收下、上游拒绝 |
| `evs`、`floor`、`flying` | 活体 | 事件缓冲，下标就是序号；已经放掉到第几号；在途而还没有得到已保存的那一段 |
| `upState`、`toUp`、`fromUp`、`upEvents` | 上游与线上 | 上游的会话；在途的命令；在途的上游消息；上游发过几条事件 |
| `got`、`cur`、`view`、`done`、`tail` | 消费者，耐久 | 它存下的记录；存到第几号；它对每条命令认定的结局；收没收到结果；它认为自己的记录全、有缺还是不知道 |
| `inbox` | 消费者，会丢 | 在途的一次交付 |
| `sessions`、`cmdSent`、`verdict`、`total`、`overflowed`、`delivered`、`crashes`、`ccrashes` | 只为检查 | 建过几次上游会话；每条命令真实送出几次；上游对它的裁决；事件一共编过几号；缓冲满没满过；交出去过的每一段；两方各丢过几次 |

## 2. 规则

1. 连之前先耐久地记「可能已发出」（`RecordSend`），再连（`Connect`）。
2. 新的驱动接手时，发送状态不是未发出而连接不在它手里，就不连，以 `runtime` 的失败收场，事件编号记未知（`Recover`）。
3. 活体只在开着时收下没见过的命令身份，送出一次（`Submit`、`SendCmd`）。
4. 活体按到达次序给事件编号（`Push`）。交付的那一步把消费者已存下的放掉（`Deliver`）；消费者存下才算数（`Record`）。
5. 缓冲满了放掉最老的、还没交出去的；在途的那一段不放掉（`Push`）。上一次交付没有得到已保存时原样重投；要交的位置已经放掉时交一个缺口（`Deliver`）。
6. 见到上游的关闭事件：会话没开起来是失败；为取消请求过关闭是被中断；其余是完成。用量这时才知道（`RecvClosed`）。
7. 连接断了或期限到了，活体自己放掉连接并收场：为取消请求过关闭是被中断，否则是失败（`ConnLost`、`Deadline`）。期限在每个阶段都有。
8. 收场的那一步记下事件编到了第几号。
9. 收场之后活体会退出（`BodyExit`）。消费者在活体不在之后才收到结果（`ConsumerEnd`），这时没有结局的命令认成不知道，并拿结果里的编号判断自己的记录全不全。

公平性逐个动作给，只给 Model 自己的步骤、宿主的再驱动与消费者收下的两步。上游答不答、连接断不断、谁丢不丢、消费者发不发命令，都没有公平性。

## 3. 性质

| 性质 | 说的是什么 | 规格 |
| --- | --- | --- |
| `OneSession` | 至多建一次上游会话 | MD-56 |
| `CmdOnce` | 每条命令至多真实送出一次 | MD-57 |
| `ViewTruth`、`ViewStable`、`UnknownNotResent`、`DoneClean` | 消费者认定的结局与上游的裁决一致，定了不变，认成不知道之后不再送出，收到结果后没有悬着的命令 | MD-57 |
| `NoGap` | 缓冲没有满过，消费者的记录里就没有缺口 | MD-58 |
| `GotOrdered`、`GotAppendOnly` | 消费者的记录按序号一条接一条，跳过的地方有缺口记号；只追加 | MD-58 |
| `SameKeySameContent` | 同一个键交出去的内容每次相同 | MD-58 |
| `TailHonest` | 消费者认为自己的记录是全的，它就真的是全的 | MD-58 |
| `DrainedBeforeUnknown` | 活体还在、缓冲里还有某条命令的结局时，消费者不会把它认成不知道 | MD-58 |
| `CompletedOnlyIfClosed`、`UsageHonest` | 说完成、用量知道，都必须见过上游的关闭事件 | MD-59 |
| `Settles`、`CancelSettles` | 每次调用终究收场；取消之后终究收场。都不依赖上游答复 | MD-60 |
| `ConsumerLearnsEnd` | 调用收场之后消费者终究收到结果 | MD-60 |
| `TypeOK`、`PhaseSend`、`ConnNeedsBody`、`OutcomeStable` | 取值合法；开着或关闭中时发送状态是已发出；连接只属于活体且收场后没有连接；结局成立后不变 | — |

## 4. 配置

`check.py` 逐个跑并判结果，日志与摘要写到 `--out`，不写进本目录。

| 配置 | 改坏了什么 | 应当的结果 |
| --- | --- | --- |
| `positive` | 没有。两条命令，缓冲不会满 | 全过 |
| `small-buffer` | 没有。一条命令，缓冲容量 1 | 全过 |
| `volatile-send` | 连之前不记「可能已发出」 | `OneSession` 红 |
| `reconnect-on-redrive` | 新的驱动重连 | `OneSession` 红 |
| `reconnect-resends` | 同上，只查命令 | `CmdOnce` 红 |
| `command-not-idempotent` | 去掉按身份的查找 | `CmdOnce` 红 |
| `release-on-deliver` | 交出去就放掉，不等存下 | `NoGap` 红 |
| `silent-drop` | 放掉了的不交缺口 | `GotOrdered` 红 |
| `drop-in-flight` | 在途的那一段也放掉，不记着它 | `SameKeySameContent` 红 |
| `end-before-drain` | 活体还在就推结果 | `DrainedBeforeUnknown` 红 |
| `no-through` | 结果不带事件编号 | `TailHonest` 红 |
| `lost-as-completed` | 断线或活体丢了记成完成 | `CompletedOnlyIfClosed` 红 |
| `wait-for-upstream` | 没有期限 | `CancelSettles` 红 |
| 十三份 `*-reachable` | 没有。各带一条「永远不会」 | 那一条红，说明对应的状态到得了 |

`*-reachable` 盖住的状态：三种终止与三种失败成因；取消到了而上游先自己关了仍是完成；命令被收下、命令不知道；消费者丢过之后重新收到；缺口；消费者的记录全、有缺、不知道。

## 5. 模型到代码

| 模型里的 | 代码里的 |
| --- | --- |
| 耐久的八个变量 | 调用聚合，写入者是 `ModelCommands` |
| `RecordSend`、`Recover` | 发送围栏、发出记录与驱动接手的规则 |
| `tab`、`evs`、`floor` | live 活体，按「租户、调用」登记 |
| `Submit` | `ModelLiveCalls.command` |
| `Deliver` 与 `Record` | 经 `ModelResultReceiver` 的一次事件交付与它的已保存回执 |
| `End`、`Cancel` | 两种控制意图 |
| `Deadline` | 开会话、关闭、上游会话三个期限 |
| `BodyExit` | 收场之后交完剩下事件的期限 |
| `Redrive` | 宿主的启动扫描 |
| `ConsumerEnd` | Model 在活体退出之后推结果，消费者收下 |
| 上游的动作 | live 引擎的事实流 |

## 6. 模型不覆盖的

- 有上界：一次调用，至多两条命令、两条上游事件，两方各至多丢一次。
- 媒体帧。它不编号、不保管。
- 上游乱序或发来协议不许的消息。由契约测试守。
- 存储提交结果不知道。沿用 [CallEnds](../call-ends/formal-mapping.md) 的认回。
- 活体在进程里因异常死掉而进程没有重启。规格要求活体把任何异常按连接断了处理，由契约测试守。
- 媒体不经这条连接走的情形。那时活体可以重新挂上，生命周期不同。
- 规格里另外四条规则：计划停止；接收方确定拒绝之后记一次控制；写入答执行已不属于这个执行方时放掉连接而不写终局；同一个命令身份再来时认回。模型里同一身份再来不改状态，其余三条没有动作。它们由契约测试守。
