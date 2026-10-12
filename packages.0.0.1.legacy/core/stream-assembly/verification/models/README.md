# 到达装配的有限序列模型

本页将[行为规格](../../SPEC.md)对应到模型性质、配置及验证边界。它不记录单次执行结果。实际输入、输出和耗时归工作树 tmp。

## 性质与独立证据

| 性质 | 模型定义 | 证据及限制 |
|---|---|---|
| 块次序等于开块次序 | BlockOrderIsOpenOrder | order_by_close 负控必须给出后开先封的反例 |
| 到达装配等于独立构造的一次性到达 | SplitInvariance | replace_as_append 负控必须给出同一整体替换块被填两次的反例 |
| 一次性形式的每个事件均被接受 | OneShotAccepted | oneshot_close_first 负控必须给出已填、已封口块的封口被排到填之前的反例；只覆盖模型 Valid 的语法子集 |
| 收尾是最后事件 | FinishIsLast | 复述 Valid／Abandon 的守卫，不作独立证据；真实拒绝由规范输入测试 |
| 账至多一次、工具侧无账 | AccountAtMostOnce／ToolHasNoAccount | 复述 Valid 的守卫，不作独立证据 |
| 索引终身唯一、开块索引递增 | OpenIndicesIncrease | 复述 Valid 的守卫，不作独立证据 |
| 填仅落在未封口的块 | FillsLandOnOpenBlocks | 复述 Valid 的守卫，不作独立证据 |
| 收尾后才有结算；放弃相当于补 lost | ResultOnlyWithFinish | 复述 CloseOut／Abandon 的守卫，不作独立证据 |

这些性质没有公平性或无限进展主张。模型不证明真实路由、租户授权、持久恢复或宿主生命周期。

## 抽象与前提

每个模型实例是一条流。Start 非确定地选择模型侧或工具侧目标，模型穷尽两者。状态为已接受的事件序列 log；被拒事件没有迁移，拒绝零影响是建模方式，不是检查所得性质。

Assemble 按序列折叠并结算，是被检查的对象。OneShot 独立按块构造：每块开一次，至多一个填，追加载荷相接、整体替换取末次，再按原样封口或保留未封口，最后交账和收尾。OneShot 不调用 Assemble 或 Valid；SplitInvariance 与 OneShotAccepted 分别检查结果相等和构造合法。

Kinds 的 grow／call／whole 分别抽象可追加块、调用块和整体交付块。载荷为符号序列，标识、标注和块头不入模型。封口块等于实际送达填的归约是[生产者前提](../../../arrival-events/SPEC.md#填封口与首内容)，不是模型证明。

Result 比公开结果更细，带 sealed／partial／incomplete 标记；细结果相等蕴含公开块结果相等。账只抽象为 reported／unknown／frames，结局只保留 reason。模型 trim 占序列位置但不改块、不标记调用，也不计配对汇总。

## 配置与有效性

在本目录执行 TLC，指定 Assembly.tla 及对应 cfg。全部配置采用两个索引、两个片段符号、MaxEvents=6；同一配置规模不因搬迁改变。它们关闭死锁检查，因为能力不承诺进展，上限用完后的停步不是反例。

| 配置 | Mutation | 必须得到的结果 |
|---|---|---|
| [Assembly.cfg](Assembly.cfg) | none | 在给定范围内没有反例 |
| [Assembly_OrderByClose.cfg](Assembly_OrderByClose.cfg) | order_by_close | BlockOrderIsOpenOrder／SplitInvariance 的对应反例 |
| [Assembly_ReplaceAsAppend.cfg](Assembly_ReplaceAsAppend.cfg) | replace_as_append | SplitInvariance 的对应反例 |
| [Assembly_OneShotCloseFirst.cfg](Assembly_OneShotCloseFirst.cfg) | oneshot_close_first | OneShotAccepted 的对应反例 |

[Assembly.tla](Assembly.tla)的四个状态变量是 st、tk、log、res。关键路径须可达：两块并开、交错填、逆开块顺序封口、整体替换被填两次。Abandon 补的收尾不占 MaxEvents。三个负控都必须产生与变异含义相符的反例；工具错误、超时或任意非零退出不算有效负控。

两个索引与两个片段足以区分上述关键路径，六个事件容纳两块各开、填、封；收尾由独立动作承载。更大规模是另一次检查，不自动增强当前结论。

## 未覆盖的义务

- 参数解析、解析不了以及被砍调用落半截：实际规范输入和一致性测试验证。模型将封口调用统一写 sealed，不区分 unparseable；trim 不触发内容改变。
- 砍汇总、frames.emitted、首内容位置／时间和快照：由值测试及性质测试验证，不在 Result 或相等性质里。
- 表示层拒绝及固定优先级：字母表只含合形状事件，不含块头模态、载荷拒绝、replace_payload_shape、带 error 的 finish；必须用[规范输入](../../tests/fixtures/README.md)验证。
- 宿主路由、分叉、乱序、重复、重建、观察者续接和跨进程时钟：由真实消费者履行[验证义务](../README.md)。单条流、串行调用方的模型不覆盖这些责任。

TLC 的有限检查不等于任意范围的形式证明。运行结果不能代替未覆盖义务。
