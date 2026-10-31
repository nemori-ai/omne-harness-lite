# Model 成员测试

本目录维护单元和契约测试。[public-entry.spec.ts](public-entry.spec.ts) 使用真实 workspace 包入口，检查根入口导出清单，并核对源码不到达保管实现、Cordis 或 model-host-local。[judgment.spec.ts](judgment.spec.ts) 用内存状态快照直接覆盖存在性与解析的判定：五种结果、租户隔离、官方默认凭据的取舍与关闭。public-entry.spec.ts 还断言 `./cordis` 与 `./execute` 子路径不可解析、清单精确导出根与独立 testing 入口且不声明 Cordis、proper-lockfile 与 model-cordis-contract。判定对未经铸造的查询租户一律返回拒绝，快照里有未经铸造的绑定租户时不给工厂秘密，由 judgment.spec.ts 覆盖。保管、持久化、文件故障与 Cordis 插件的测试在 [model-host-local](../../model-host-local/tests/index.md)。

运行命令为 `pnpm --filter @omne-harness/model test`。内存行为测试经公开 testing 入口覆盖 22 个 Commands、未知写、流归约、读/ACK/清理和五端口。runtime-testing 检查真实构造的零调用、未支持操作与阶段诊断，以及重复、并发和多工厂回复的对象独立性。这些是本地模拟，不覆盖耐久或生产托管执行。运行实现完成后须加入实际提供者与存储交接的验证，并注明替身和故障范围。

[vitest.config.ts](../vitest.config.ts) 仅把 model-contract 的根入口与 testing 子路径映射到其公开源码入口，避免行为测试读取并发 build 正在重建的 dist。它不匹配私有子路径，也不改变 Node 的包解析。public-entry 的 Node resolver 与独立安装场景继续验证真实 exports 和制品。

固定输入归 [fixtures](fixtures/index.md)。持续验证义务见 [verification](../../model-contract/verification/index.md)，目录导航见 [index](index.md)。

## 独立执行

[execute.spec.ts](execute.spec.ts) 经真实 model 根入口连接公开 createScriptedTransport，检查单次发送、重复迭代、并发推进、首供应商、准备拒绝和物化回执。回执拒绝断言包含 receipt 字段定位、不匹配原因或读取失败阶段。[execute-lifecycle.spec.ts](execute-lifecycle.spec.ts) 使用本成员受控传输，覆盖准备等待取消、启动后确认与失联、消费者早退、原生 return 排队，以及终局交付前的清理次序和失败报告。提供者返回的 done、value 或 kind getter 抛错时，测试要求唯一安全 stream-lost 及完整释放。[execute.spec-d.ts](execute.spec-d.ts) 检查根函数精确签名。

[execute-outcome.spec.ts](execute-outcome.spec.ts) 经同一公开入口注入 prepare 和 materialize 的 Outcome getter。测试检查 ok 或 failure 读取抛错后的安全 unavailable、阶段诊断、零发送及已取得资源的关闭。可读取的 getter 还验证载荷只读取一次、声明失败保留原对象，以及成功资源在终局前各关闭一次。

[execute-transport.spec.ts](execute-transport.spec.ts) 直接对 provider 的 transport 运行共同符合性，逐项要求六个 transport ID 为 pass。该套件不调用 executeModel，不能单独证明执行组合。上述执行测试才覆盖真实 executeModel 的交接。受控传输只提供事实、等待和故障，不替执行函数完成取消分类、回执校验或清理。这些证据没有真实 HTTP、厂商模型、耐久后端或托管运行。

## 安装闭包

`pnpm --filter @omne-harness/model run install-closure` 调用 model-contract 的安装闭包设施，策略为 [fixtures/install-policy.json](fixtures/install-policy.json)，场景为 [install/scenario.mjs](install/scenario.mjs)。场景还用已安装 sender 的公共 started.window 与 facts 调用真实 Commands.preserve，并核原调用快照、一次 start 与资源关闭。场景导入 `@omne-harness/model`、`@omne-harness/model-contract`、契约 testing 入口、`@omne-harness/content-block` 与 `@omne-harness/legal-identity`：以注入的端口调用 `deliver`，覆盖已发送、拒绝、缺席三条路径，并对一个快照做铸造租户的判定。另用已安装根入口的 executeModel 连接公开脚本传输，验证一次发送与两级关闭。给出 `--scenario` 时设施把闭包里的每个工作区成员声明为消费工程的直接依赖，所以场景导入得到 model-contract 与 legal-identity。运行带 `--out <报告.json>` 写出报告，退出码 0 表示 `forbidden` 为空且全部检查（含 `scenario-run`）通过。报告写在任务的 `tmp/`，不入库；它只证明 model 自己的安装闭包与场景，不证明 model-host-local 的闭包，另覆盖已安装 testing 入口、未支持 quiesce 的诊断，以及真实 runtime 受理、认回、跨租户拒绝、唯一首次 prepared 分派及真实 connect/observe 初始快照。无外部发送计划时 drive 明确返回 unavailable，实例仍可观察。该场景覆盖最小实例观察连接，不证明完整托管业务执行或生产宿主。

## 内存行为资源

- [memory-admission.spec.ts](memory-admission.spec.ts) 检查显式/采用/请求值的参数边界、工具关联、typed 拒绝及未知注入不被非法请求消费；请求各序列与三个 stop 承载的单空位、中间空位、合法密集值及绑定冲突。
- [memory-core.spec.ts](memory-core.spec.ts) 检查身份、受理、操作唯一、未知与恢复。
- [memory-dispatch.spec.ts](memory-dispatch.spec.ts) 检查物化、首内容、批次原子性、重试、终局和供应商账目修订。
- [memory-dispatch-refusals.spec.ts](memory-dispatch-refusals.spec.ts) 检查发出边界的具名拒绝：首次发出只接受请求的第一个供应商且没有策略决定；回执须指名发出的供应商、请求的表示与合格的摘要；完成终局没有块、有未封口的块，或封口块组成不了一条消息时拒绝，整批不保存；没有回执的发出只有思考块时照常保存，有推理续接状态时以 `replay-format-unknown` 拒绝。
- [memory-replay.spec.ts](memory-replay.spec.ts) 检查收场的回放：`scope` 取请求声明，`format` 取物化回执的 `replayFormat`；含推理续接状态的回复在流内与晚到终局两条路径上，缺格式时都以 `replay-format-unknown` 拒绝且不保存。
- [commands-accounts.spec.ts](commands-accounts.spec.ts) 对内存 ModelCommands 运行账目共用套件 `checkCommandsAccounts`，要求全部九项通过。admit 的请求含两条消息，使保留的消息身份可见。它还对改坏一条规则的内存副本运行套件，要求对应项失败，证明每项都能变红。每一项至少有一份这样的副本。改坏的规则是：读取时账目缺少调用方的 `subject`；读取时每份账目都标为 `received`；每次到达都当成新事件；没有账目的调用读到另一调用的账目；报告自带的 `subject` 被删去而不是被拒绝；读取不核对调用方的资格；清理时一并丢弃消息身份；物化回执缺 `replayFormat` 时自行补一个格式。
- [memory-consumption.spec.ts](memory-consumption.spec.ts) 检查完整块分页、当前资格、ACK 与材料释放。
- [runtime-testing.spec.ts](runtime-testing.spec.ts) 检查逐方法构造依赖、发送身份关联与调用后引用修改隔离、send/retry 参数及稀疏序列失败通道、一次发送及耗尽/异常/取消释放、宿主和手动时钟。

fixture 的主体与证据只在本地测试适配中可信。它们不替代真实耐久、消费者完成、跨进程排除或资格事务的证据。

内存部分结果场景见 [memory-partial.spec.ts](memory-partial.spec.ts)。测试按真实保存与结算驱动，覆盖未封值、提醒、超目标完整项、页完整编码硬界与临界预留下的控制/承接/释放。scripted 显式结算不代替这些映射证据。

## 受理与首次分派

[runtime-admission.spec.ts](runtime-admission.spec.ts) 使用真实 createModelRuntime 和 driver。测试覆盖受理重复与冲突、取消原操作、跨租户及当前撤权、唯一首次分派、claim 冲突与 stale、未知 prepare 的 applied/dropped 原参重放、并发唤醒及停止后的待办。受控依赖只提供资格、可信 continuity、故障和唤醒，不代 driver 调用 claim 或 prepare。

带类型的输入回归验证 admit 拒绝额外 onProgress 字段，其他入口保持原身份行为。它使用带函数的不透明 principal 和原已铸造租户，通过真实受理、查询、首次分派与取消，检查身份引用保持有效。

共同符合性使用[runtime-conformance-fixture.ts](runtime-conformance-fixture.ts)唯一装配，完整保存53项实际结果。15项 settlement、未知 ACK 原操作认回和三项消费 route 逐名要求 pass。startRun/settleCall 使用真实 driver、receiver、preserve 和 settle；证据来自[承接方完成记录](completion-records.ts)，adapter 核全部字段及 tenant/call/result/consumer。unknown 包装真实 handoff，撤权映射 content/handoff，清理 hook 使用有效 execution 调实际 advanceCleanup。quiesce 等未支持项仍按真实结果报告。


## 准备资源与校准租约

[preparation.spec.ts](preparation.spec.ts) 经根入口的 `createModelPreparationResources` 验证租约：家族绑定来源是替身，它的计量器记录收到的 `MeterCalibration`；调用事实一部分来自真实内存 Commands（受理、分派、物化、账目、收场、ACK 与清理），一部分来自只实现 `dispatches` 的存储端口替身。测试覆盖：没有 lineage 时计量结果与家族计量器相同且不读取；锚点命中交出 X 的三项之和与消息序列；X 被确认并清理后仍命中；另一租户的调用与不存在的调用给出逐字节相同的结果；每种锚点不命中原因与每种来源扣留原因；来源回执的表示采用不同而供应商相同时照常交出 O；每个调用按调用方访问依据只读一次；超限、重复消息与坏身份的拒绝，以及恰好到上限时接受；空 lineage 等于没有 lineage；回执只差一个采用字段、没有回执、计数缺席或不是十进制整数时的判决；构造选项逐条的 `RangeError` 与供应商端口改动路线的每个字段；后一供应商失败时释放先取得的绑定；释放幂等、释放失败为值、释放后有无 lineage 的计量器都不可用。token 算术不在这里：两个家族包用真实计量器与 `rules.plan` 的表示验证它。

## 产品发送验证

[send.spec.ts](send.spec.ts) 通过真实 runtime 和 driver 建立 prepared dispatch，经公开产品 sender 验证凭据五结果、scope 与禁止回退、显式 factory 来源、回执提交、物化/开窗/send 写的 applied 与 not-applied 原参数认回、当前撤权/取消/代次排序，以及两个 sender 共用后端的一次 start。查询拒绝、异常或仍未知时保留原尝试和容量；已确认提交但回执暂不可取时仍保留资源。产品闭包在同步重入和重复调用时最多解析并 start 一次，保留原事实流。后端认领另在 recordSend 尚未提交时核实，不能用本地 map 替代。单 iterator、原流未预取、abort 中断事实、done/return/throw/读取异常、逆序幂等释放及释放失败均有行为断言。

[send-fixture.ts](send-fixture.ts) 只提供真实内存 Commands、资格安排、脚本外部传输、资源及故障。它不编排发送。未知流始终由产品 sender 保留和交接。公开类型由 [send.spec-d.ts](send.spec-d.ts) 核对，安装场景运行已安装根入口的产品工厂，确认提交真实回执、一次 start 与资源关闭。

完整符合性报告继续保留53项，增加脚本 transport 的六项真实检查，其中 materialization-receipt-matches-request 必须通过。该项只证明传输形状，本页产品 sender 测试另证明实际发送链的提交和使用。driver 已通过真实产品 sender 消费原 facts；最小观察与四项目录行为有独立断言，已支持[有限的原终局收场](../SPEC.md#已实现的调用收场)，结果读取及 processed ACK 已实现。所有证据均为受控内存与脚本，不覆盖真实厂商、耐久后端、生产宿主或跨进程恢复。

[send.spec.ts](send.spec.ts) 通过真实产品 sender 和 Memory Commands 验证两个独立公共 window 的事实保存，及 tenant、call、execution、dispatch、window 错绑拒绝。recordSend 的 applied/not-applied 未知测试核原窗口、未预读的原流、单次交接、一次 start 与资源释放。脚本只提供传输事实，不证明真实 HTTP、生产耐久或跨进程恢复。

## 原流接收与实例观察

[runtime-fixture.ts](runtime-fixture.ts) 只安排合法宿主、当前资格、外部脚本流与故障。它使用实际 runtime、sender 和 Memory Commands，不生成快照或代做 preserve。[runtime-observation.spec.ts](runtime-observation.spec.ts) 核初始发布、独立控制更新、observe-only 资格、pending 撤权/abort 与后继实例限制。[runtime-receive.spec.ts](runtime-receive.spec.ts) 核原窗口、未知 open/preserve/sender 写认回、取消与确认屏障、正数批量、沉默 pending next、首内容、首项/保存交错、EOF/异常前缀及资源释放。

[runtime-transitions.spec.ts](runtime-transitions.spec.ts) 注入附带刷新异常、挂起和乱序回包，检查原流保留、确认后不重放、明确拒绝后一次释放与状态不回退。按调用驱动锁分别在 next、preserve 和正常资源释放等待时接受重入探针，要求明确 busy 且原调用正常完成。

观察边界测试另核登记不足、落后超额、共享大快照、并发 next 无队列和健康观察者继续。完整53项报告保留 quiesce 等未支持项的真实 fail/不适用状态，不据局部通过宣称完整 Model 符合。全部组合仍限受控内存与脚本，不证明真实后端或生产宿主。

## 原调用收场与教学脚本

[runtime-settlement.spec.ts](runtime-settlement.spec.ts) 经公开 createModelRuntime、实际产品 sender 和内存 Commands，覆盖正常完成、真实 trim、input-over-limit 的已知与未知字段、控制前后竞争、固定 unknown 输入、已知提交回执暂不可得、当前资格及代次、唯一释放与释放挂起/失败。它还通过可信 recordLateFact 及事件重放比较原 termination、version 和 source，验证可变 dispatch 终止历史不被当作原逻辑终局。非终止原流、观察确认顺序、互斥和投影单调的回归继续保留。

确认回调故障回归核对原 Snapshot 的正文、cursor 和真实 Settlement 一致。重复故障继续保留原确认依据和内容屏障，控制刷新不能把新状态拼到旧正文。恢复及重复 drive 不重读、不重保存、不重收场或重复释放；已确认后的控制状态保持单调，重复 drive 不产生额外观察通知。

[runtime-settlement-facts.ts](runtime-settlement-facts.ts) 只将符合性输入变成上游事实。runtime-admission 的 settleCall 钩子只推送事实并等待真实 driver，不直接代调 settle。完整 53 项报告保留全部实际结果，直接终局项 settled-call-keeps-termination 要求通过；结果读取及 processed ACK 由下节公开消费测试与同一完整符合性装配覆盖，报告持续保留实际未支持项。

`pnpm --filter @omne-harness/model examples` 顺序执行[五个教学脚本](../examples/README.md)。包 test 也运行这五个脚本，typecheck 覆盖 examples。脚本从真实公开入口消费构建产物，保留必要失败分支。该验证只覆盖内存后端、受控宿主与脚本传输，不覆盖真实厂商或耐久存储。

[example-support.ts](example-support.ts)是五课共用的教学测试装配，只导入公开包入口。它使用 testing 提供者，按产品规则保留在 tests 路径，不能作为生产授权或宿主实现。关键业务调用仍在各课脚本。

## 公开结果消费

[runtime-reading.spec.ts](runtime-reading.spec.ts)通过真实收场结果检查两种冻结页配置、原读取认回、当前资格、跨租户拒绝与幂等关闭。[runtime-acknowledgement.spec.ts](runtime-acknowledgement.spec.ts)检查输入别名、等待后撤权、applied/not-applied 未知及持续未知、严格证据、操作冲突、活动读保护、清理释放与辅助异常。消费不依赖 control/recovery 权限，也不新增调度。

[memory-paging.spec.ts](memory-paging.spec.ts)在最小可受理预算中调整到最大安全整数，检查分页准备已经预留容量。原 memory-partial 持续覆盖超目标单项独页、整页容量及终局/控制/ACK/释放的临界预算。结果冻结后禁止重配，准备错误不得部分修改配置。

这些是本地内存后端、消费者完成记录替身和脚本上游的真实产品组合。它们不证明消费者生产耐久、真实厂商、自动清理工作者或跨进程恢复。

[admit-boundary.spec.ts](admit-boundary.spec.ts) 驱动真实 runtime 与直接 Memory Commands，检查同步副本、畸形重放优先级、资格同一性及拒绝无容量/调度/发送副作用。
