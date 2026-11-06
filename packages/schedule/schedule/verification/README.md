# Schedule 形式验证

[函数与协调契约](../docs/functions-and-coordination.md) 拥有守护含义。模型检查只覆盖本节列出的抽象，不证明尚未实现的 Job 或外域能力。

## 接受边界模型

[CalendarScheduleBoundary](models/CalendarScheduleBoundary.tla) 有两个 owner、两个日历、两代环境和发布、一个语义来源请求。正常最多一个 Job，去重负控允许两个。四个正控覆盖 follow/explicit 与 latest/pinned 的组合。八个负控分别移除 owner、环境、发布、资格、控制、去重、冻结及 pinned 守卫，要求命中各自具名不变量。

| 模型状态/动作 | 对应含义及实际实现 | 尚缺什么 |
| --- | --- | --- |
| env / Observe | [prediction/basis.ts](../src/prediction/basis.ts) 的依据捕获；[Calendar 查询](../../../calendar/calendar/src/queries/index.ts) 的解析 | 未显式建模时区、授权 scope、跨租户复合键 |
| pub / Publish | Calendar 不可变版本及当前发布投影 | 版本身份简化为代数；没有真实发布事务 |
| authorized / active | 当前资格与工作控制 | 一个布尔投影，不覆盖所有授权、撤销、pause、stop、replace 协议 |
| Accept / jobs | 目标 Job 接受及冻结 | Job 接受尚未实现；原子 Accept 是待履行的协调要求 |
| RetryOriginal / RecoverOriginal / response | 原语义键重试和回执恢复 | unknown 仅模拟“已提交、回执丢失”，不覆盖提交未发生分支 |
| FrozenBasis | 已接受依据不改写 | 不建模 instruction、完整要求、交接结果或所有冻结字段 |

十个安全不变量对应 G1–G6 的投影。没有活性、公平调度、计数/Quota/outbox 原子性、取消与外部启动、介质耐久或分布式栅栏证明。现有 SQLite 提供者的资格窗口与跨进程写保护限制不能用此模型覆盖。

## 时钟消费模型

[ScheduleClockBoundary](models/ScheduleClockBoundary.tla) 有两个运行代际、单调读数 0–3、可任意前后跳变的民用读数 0–2、本地 deadline=2、操作完成资格及任意唤醒。

| 模型对象 | 消费语义与源码映射 | 限制 |
| --- | --- | --- |
| epoch / Restart | 本地时间轴，重启后不可比较旧 deadline | 当前 prediction budget 是进程内对象，无显式公开 epoch 字段；不是持久 worker 栅栏实现 |
| mono / Tick | [prediction/budget.ts](../src/prediction/budget.ts) 的 monotonicClock 和到期复核 | 模型假设同代际非递减；生产时钟异常处理需另证 |
| wall / WallJump | 民用时间不参与耗时判断 | 没有建模 recurrence、DST 或业务到期选择 |
| open / Close | **该操作**的完成资格被终止 | 不是服务准入关闭。已准入操作排空完成不构成违反 |
| wake / Timer | 可重复、丢失、任意时刻的唤醒 | 不是可靠投递或截止保证 |
| Settle / witness | 在同一抽象步骤记录资格检查时的观察 | `ok` 只表示资格满足，不表示真实结果正确或 Job 已接受 |

正控检查类型及 NoEpochReuse、NoExpiredRead、NoClosedRead。三个负控各移除一个守卫，必须发现对应违反。结果一旦记录，后来关闭、到期或重启不会否认当时真实的完成资格。模型没有活性假设，因此不承诺丢醒后最终完成。

## 持续证明义务

### S1 预测符合性与源码映射

S1 的固定输入包括定义、定义修订、已消耗次数、查询时间与数量、激活边界、采用依据和政策。依据还固定时区规则版本、规则引擎版本、环境修订和实际日历版本。仅固定日历名称或请求中的 `latest` 不满足此前提。

令 `P(x, b)` 表示这些输入 `x` 在固定依据 `b` 下的预测。确定性要求比较两个完整成功的结果。提供者失败或期限耗尽可以使其中一次返回错误或有限未完成，不能据此声称所有运行都返回相同结果。`complete` 表示所请求的候选前缀已确定，或规则/次数边界已完整耗尽；不表示已经枚举无限规则的所有日期。

| 性质 | 保护它的源码 | 可重跑反例与组合入口 |
| --- | --- | --- |
| follow 只采用一份同 owner 的环境；explicit 不读取环境；实际日历版本固定 | [basis.ts](../src/prediction/basis.ts)、[calendar.ts](../src/prediction/calendar.ts) | [dependencies.spec.ts](../tests/prediction/dependencies.spec.ts)、[calendar-identity.spec.ts](../tests/prediction/calendar-identity.spec.ts) 检查错 owner、错时区、错版本、覆盖及见证；缺失 pinned 不能退回 latest |
| 来源按固定规则展开，依次检查原始边界、日历条件/移动、移动后边界和 DST | [sources.ts](../src/prediction/sources.ts)、[pipeline.ts](../src/prediction/pipeline.ts) 的 `process` | [prediction.spec.ts](../tests/prediction/prediction.spec.ts) 覆盖补班、假日、移动后排除、DST gap/fold 及次数 |
| 同一执行时刻合并来源，只有不会再被未来来源改变的候选才能输出 | `PredictionPipeline.pending`、`frontier`、`seal` | [budgets.spec.ts](../tests/prediction/budgets.spec.ts) 检查预算耗尽不暴露未封闭碰撞，且保留已封闭时间前缀 |
| 非法输入、错误提供者和预算不足不成为完整空结果 | [index.ts](../src/prediction/index.ts)、[budget.ts](../src/prediction/budget.ts) | [input-boundary.spec.ts](../tests/prediction/input-boundary.spec.ts)、预算和响应身份用例；错误保留请求关联 |
| 真实日历回应与纯预测的约定一致；预测不写日程事实 | [Schedule local 组合](../../schedule-local/tests/assembly/seeded-calendar.spec.ts)、[nth 组合](../../schedule-local/tests/assembly/real-calendar.spec.ts) | 实际 SQLite Calendar、发布种子、Schedule worker 与 Cordis；重复成功结果相同，日程、修订和 outbox 不变 |

源码论证的关键不变量是：`pending` 中的候选尚可被后续来源补充；已输出候选严格早于未来来源的保守下界。`process` 不发布或修改已封闭候选；它维护待定候选、排除说明和预算。`seal` 按时刻排序后移动满足下界的候选。有限规则耗尽时才可用无上界的封闭操作。该论证依赖枚举器的来源顺序、分页推进以及 `frontier` 下界正确；目前以具名用例和真实组合守护，尚无机器检查的源码归纳证明。

上述组合中的身份、环境及提交 guard 仍有标明的测试替身，不能证明真实授权或 Schedule 写入当前性。真实 Settings 读取另由 [Calendar 组合](../../../calendar/calendar-local/tests/settings-composition.spec.ts) 守护，返回观察值，不预留后续写入资格。两组测试不能拼称一个已经接通的生产纵切。

分别运行核心及本地符合性入口：

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/schedule exec vitest run --mode fast tests/prediction
./scripts/with-test-slot.sh pnpm --filter @omne-harness/schedule-local exec vitest run tests/assembly/seeded-calendar.spec.ts tests/assembly/real-calendar.spec.ts
```

### 后续接受与执行义务

S2 的有限接受投影和 S3 的时间资格检查已有模型入口，但源码并未获得精化证明。S4 双 scanner 与同提交、S5 取消/启动/旧执行者、S6 可靠恢复与进展，在对应实现切片开工前必须补状态模型、负控及实现映射。缺少义务不得用基础模型的绿色结果放行。

真实测试还应覆盖民用时钟回拨/前跳、同代际单调时间异常、重启重建 deadline、迟到回调、两个进程同时接受、提交前后 kill、未知回执与原键恢复。硬截止、背压与资源稳定性需要宿主和故障实测，不能由 TLA 中的有限整数推得。

## 执行与判读

环境需要 Python 3、Java 及 TLA+ 的 tla2tools JAR。使用维护者提供的工具，不由脚本联网下载。已核对 TLC 2.19（tla2tools 1.7.4 发布物）与 Java 21；升级工具后重验正控和负控。设置 `TLA2TOOLS_JAR` 为实际 JAR 文件绝对路径，必要时设置 `JAVA_BIN`。

```sh
pnpm --filter @omne-harness/schedule verify:formal
python3 packages/schedule/schedule/verification/check.py --self-test
```

[清单](models.json) 声明每个配置及期待结果。[执行器](check.py) 每个配置只用一个 worker，512 MiB 堆和 60 秒期限。正控必须退出 0 且有完整成功标志；不变量负控必须退出 12 并命中指定不变量；时序负控必须退出 13 并有循环/停滞反例。解析错误、错打不变量、工具缺失、超时或中断均不算通过。自检包含九个真假结果判读样本。

输出写入仓库 `tmp/formal/schedule/<时间-进程>/`，包含命令、日志、模型/配置/执行器哈希、Git head、JAR 哈希及 Java 版本。Git head 不代表未提交输入，因此输入哈希必须一并保留。负控的“passed”表示成功检出预期缺陷，并非错误模型满足性质。

这是显式包级守护，尚未自动接入根 `pnpm run check`。涉及本说明性质的切片在实施前和交回前均调用；若其前提、模型或工具变化，重新执行全部相关正负控。没有生产源码精化证明，不把此命令替代公共 API 测试、存储故障、集成或独立接受。
