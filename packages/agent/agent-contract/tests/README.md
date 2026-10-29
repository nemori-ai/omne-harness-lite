# Agent 声明契约测试

## 运行

在仓库根执行 `pnpm turbo run test --filter=@omne-harness/agent-contract`，在本成员目录执行 `pnpm typecheck`。本目录里的 `pnpm test` 只运行 Vitest，不构建。测试通过包名消费真实入口，不深层导入实现。

## 覆盖

[public-entry.spec.ts](public-entry.spec.ts) 检查合法声明、定义不带版本（带 `version` 得到 `malformed`）、拒绝原因的分类、九处扩展位置与三档干预力、`needs`、`implementation`、`onError`、`unavailability` 及其合法组合、两个声明判定的成功值逐层冻结且不与输入共享对象、输入副作用、Schema 校验，以及依赖约束：清单声明资产包，不声明装配、`agent`、`agent-host-local` 和任何 Cordis 包。[import-cache.spec.ts](import-cache.spec.ts) 检查导入不分配缓存、一次批次共用校验域及退出释放。

[judge-output.spec.ts](judge-output.spec.ts) 检查 `judgeExtensionOutput` 的位置输出表逐格（12 行乘三档干预力）、十种拒收原因、七步判定顺序、`retry` 的两种触发、`ask` 在 `after_terminal` 和改写字段的限制。

[identity.spec.ts](identity.spec.ts) 检查十四个身份解码函数各自的成功与四种失败（类型、空串、过长、字符）及长度边界，`judgeAdoption`、`judgeEvidence`、`judgeAccess`、`judgeAuthority` 的成功、缺失、类型、空串、未知字段与 `identity` 拒绝，访问器不被执行、成功值被冻结，以及 `Access` 的主体判定由调用方注入、租户必须由 legal-identity 铸造。

[public-api-names.spec-d.ts](public-api-names.spec-d.ts) 是类型测试：设计页五章的每个名字都能从包入口导入，并对 `Next`、`Failure`、`Subject`、`ExecutionState`、`FinishResult`、`ExecutionControl`、`AgentEventBody`、`CallerCommit`、`AgentAccessDecision` 等判别字面量逐项断言，对 `AgentJournal` 逐一断言它可赋给五组端口接口，并断言各组端口的成员集合。它还按[扩展作者协议](../docs/public-api/extensions.md#位置与作者可见的-subject)的 subject 表逐行写出十二种形状，断言每一行恰好等于 `Subject` 联合的一个变体，十二行合起来等于整个联合。

同文件核对 `AgentClock.now` 不接收参数，返回 `Reply<AgentInstant>`。它只证明形状，不证明具体时钟可用或准确。

[export-set.spec.ts](export-set.spec.ts) 把包入口的运行时导出排序后与写死的清单比较，并断言包内共享的辅助函数不在入口。[dependency-direction.spec.ts](dependency-direction.spec.ts) 沿构建后 `dist/index.js` 与 `dist/index.d.ts` 的导入图断言不含 Cordis、`agent`、`agent-host-local`、`agent-cordis-contract`，并断言 `package.json` 不声明它们、`exports` 恰为 `.` 与 `./testing`；它还断言包根的导入图不加载 `./testing` 的模块与 `node:assert`，`dist/testing.js` 的导入图同样不含 Cordis 与依赖本包的成员；导入图的遍历在 [module-graph.ts](module-graph.ts)，它读文本而不用编译器接口。

[receiving.spec.ts](receiving.spec.ts) 经 `./testing` 入口运行接收面两个端口的一致性套件：两个替身各自通过全部用例。套件覆盖当前挂接下写入、同一操作认回与异条目冲突、被取代挂接得到 stale-advance 且不写入、推进者条目缺 Authority 为 invalid、跨租户与不存在的 execution 得到相同的 denied、同一 execution 文本在两个租户是两个 execution、`received` 不要求挂接且在接管与终态之后仍可写、按交付键认回与同键异内容冲突、调用引用属于别的租户时 denied、修订号前进且认回不改修订号、Model 与 Tool 的账目交付按各自的键认回，以及账目出站的重交认回、同修订异内容冲突、低修订之后到达的高修订成为当前修订、迟到低修订不取代高修订、别的租户的调用被拒、畸形调用引用为 invalid 而不是 denied、修订号畸形的账目为 invalid、主体不是该调用的账目被拒。套件的 `entry` 事件用例（SC-AG-240 至 SC-AG-249）经测试件的 `events` 读口核对：条目与事件同一次写入成立、首个事件序号为 `1` 且序号连续、`schema` 是完整的 Adoption 并与同一 execution 的其他事件相同、ended 之后只写条目、重放与跨入口认回不再分配事件、被拒绝的写入不分配事件、回执丢失时条目与事件仍一起成立、发布之前失败时两者都不留、detach 之后事件仍带最近建立的挂接；共同提交入口的六条同类用例在 `received ` 前缀下。同文件另用只破坏一条规则的提供者核对套件确实失败，并核对失败消息指向该规则：被取代挂接仍能写入、别的租户得到“不存在”以外的答复、重复推送被再次写入、重放再分配事件、ended 之后追加事件、条目没有事件、拒绝分支分配事件、回执丢失时事件缺失、发布前失败留下事件、detach 之后事件带别的挂接，以及 commit 入口的六条对应反例；别的租户的调用被收下、迟到低修订取代高修订是账目出站的反例。替身只证明契约形状与内存语义，不证明耐久、跨进程或真实 runtime。

一致性套件的用例是 `ConformanceCase` 的判别联合：普通用例只有 `name` 与 `run`；测试件缺少可选控制时，需要该控制的用例带 `uncovered`，`run` 必定拒绝。`uncovered` 表示本次运行没有证明那条规则，不表示通过。两个可选控制是 `detach`（撤销当前挂接而不结束 execution）与 `failNextRecord`（给某个 execution 下一次走到写入步骤的 `record` 布置故障：`commit-unknown` 写入生效只丢答复，`unavailable` 发布之前失败不留条目也不留事件；被拒与认回原回执的调用不消耗它）。运行方的义务：把带 `uncovered` 的用例按未覆盖报告并写明原因，不能当作通过，也不能静默跳过；[receiving.spec.ts](receiving.spec.ts) 核对缺任一控制时只有需要它的用例带 `uncovered`、其 `run` 拒绝，控制齐全时没有未覆盖用例。内存 Journal 的运行方在 [agent 的 journal-received.spec.ts](../../agent/tests/journal-received.spec.ts)。[receiving.spec-d.ts](receiving.spec-d.ts) 是类型测试：两种条目、`received` 直接用 Model 与 Tool 的交付键、`ReceivedDelivery` 按交付键的 kind 分支且账目交付不能带 null 账目、`AgentAccessOperation` 含 `receive-result`、推进者条目缺 Authority 不能通过类型检查、`ExecutionSnapshot.entries` 是可选字段、账目出站端口的输入与六种结果。

[body-contract.spec.ts](body-contract.spec.ts) 检查 `agentBodyContract` 经注册表登记与取回，以及同一组夹具在 `judge` 与 `judgeAgentDefinition` 上接受与拒绝一致、引用与声明项的提取顺序，缺 category、缺 name 或不是对象的 capability。读树逐层冻结，手造的相似节点放不进真实读树，所以正文里更深一层的 `members === undefined` 守卫只有“元素不是对象”这一种可达输入。

[limits.spec.ts](limits.spec.ts) 检查声明限额与输出限额的边界：字符串、深度、JSON 值个数、对象成员数在限额上和多一个时的拒绝，整份文本的字节数，循环引用，以及 `judgeExtensionOutput` 的深度 64、成员 10000、字符串 10000000、JSON 值 1000000。它放一个函数作探针：越过限额之前先到限额的输入得到 `malformed`，越过限额继续走的输入得到 `executable`，两者的差别晚一步的检查补不回来。数字文本的 100 个单位上限不可达（任何有限数的 JSON 文本不超过 24 个单位），所以没有边界测试。

[input-copy.spec.ts](input-copy.spec.ts) 检查判断对输入取的副本拒绝什么：原型不是 `Array.prototype` 的数组、带非下标成员的数组、原型不是 `Object.prototype` 或 `null` 的对象、符号键、反射列出却描述不出的键；成员是函数或访问器时得到 `executable`，其余得到 `malformed`。它还检查 trap 抛出异常的 Proxy 与已撤销的 Proxy 在声明判断与 `judgeExtensionOutput` 中都得到 `malformed`，判断不抛出异常，批次中出问题的项给出该项的 `index`。

[declarations.spec.ts](declarations.spec.ts) 检查成功值的成员：`attributes` 的每一项与次序、`resident` 只在给出时出现、命令实现的 `matcher` 与 `timeout` 只在给出时出现、两种 ending 与两种 scope、不是对象的 `dimension`、ISO 8601 时长文本的每个字段与前后缀。比较用 `toStrictEqual`，值为 `undefined` 的成员算缺陷。

[judge-output-data.spec.ts](judge-output-data.spec.ts) 检查 `judgeExtensionOutput` 成功时八种输出的值（可选成员只在给出时出现、`cancelled` 终态、没有选项的卡片）、`after_action` 两行的差别，以及改写与原主体的比较：值为 `undefined` 的成员、数组增减与同长换项、数组与对象互换、对象与数字或 `null` 互换、可改写路径下不是对象的节点。比较前把值转成无原型的规范形，因为成功值的原型不是契约。

两处分支没有用例，因为公开入口走不到它们。第一处是 `judge-extensions.ts` 中 `judgeLoopExtension` 的 `local-refusal`。每一项都是整批副本的一部分，整批已经通过复制与整批文本的限额，所以一项的复制与重读不会再失败。第二处是 `check.ts` 中 `settle` 的四个失败分支。`validatePlain` 在调用校验器之前已经重读文本并拒绝超限的输入，所以校验器不会返回 `unreadable`。`refused`、`unavailable` 与 `cancelled` 只在校验器自身出故障时出现：校验域已关闭、快照预算用尽、schema 加载或编译失败，或者调用方取消。判断不传取消信号，校验域在判断结束后才关闭，schema 是常量，所以公开入口造不出这些情形。

## 维护

测试名用字面文本，不用 `describe.each`、`it.each` 的模板名，也不在循环里拼名字。理由是按用例名挑测试的运行看不见生成用例的名字。`pnpm run mutation` 只跑快层，快层经 vitest 的 `experimental.preParse` 静态读取用例名，见[测试运行器的分层说明](../../../../tools/test-runner/README_ZH.md#测试运行)。只被生成用例覆盖的变异体会因没有用例被选中而显示为存活。本目录已有的生成用例覆盖的行，要由同一文件里一条字面名字的用例再覆盖一次，变异测试才量得到。[identity.spec.ts](identity.spec.ts) 末尾的字面名字用例就为这个目的而写。

## 边界

这些测试只覆盖纯判断、解码、正文契约、导出面、依赖方向和接收面替身，不证明 AgentRuntime、Journal 提供者、外部协调者协作或动态插件已经实现。装配成员拥有通过本包调用声明判断的消费者测试。资产成员不依赖本包，它的测试不导入本包。

[receiving-repair.spec.ts](receiving-repair.spec.ts) 检查参考设施在同租户跨 execution 的共同提交、旧 record 先写和仅绑定三种路径下拒绝矛盾消费；检查 Model、Tool 的完整材料可读，以及空页、非法内容、终态和附件的精确拒绝路径与零发布。required 套件还覆盖四种交付变体的同操作和跨操作认回、旧 record 同操作异 consumer 冲突、暂停期间撤销资格后返回 denied 且不留下材料、条目或 revision。
