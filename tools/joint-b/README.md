# 联调 B 的判据脚本

本目录放联调 B（波 2，纵切 S2 补齐、S3、S4）的两份判据脚本。写法与 [联调 A](../joint-a/README.md)
相同：不进工作区，不导入产品包，经构建产物起进程；步骤代号取自 `slices.md` 与波 2 边界页第五节「波 2 联调判据」。

## 判据对照

| 入口                                 | 步骤 | 判据                                                                       | 观察来源                                                  |
| ------------------------------------ | ---- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| [conversation.mjs](conversation.mjs) | S2-1 | 发一条消息，等到回复                                                       | `read-history` 翻页读到回复条目                           |
|                                      | S2-2 | 历史里用户输入与模型回复共两条                                             | `read-history`                                            |
|                                      | S2-3 | Model 账目一次请求                                                         | 域文件 `md_call` 行数                                     |
|                                      | S2-3 | Journal 有对应条目                                                         | 域文件 `sl_entry` 里有条目引用该请求的 call               |
|                                      | S2-3 | 会话日志修订号连续                                                         | `sl_entry.revision` 去重后逐一相差 1                      |
|                                      | S3-1 | 同一会话三轮都得到回复                                                     | `read-history`                                            |
|                                      | S3-2 | 三次请求的输入消息数递增                                                   | `md_call.request` 里的消息数组长度                        |
|                                      | S3-2 | 第 2、3 轮历史页读取次数只与新增消息有关                                   | 等 L-RUN 的计数事件，见下                                 |
|                                      | S3-3 | 供应商请求里有回放块                                                       | `md_part` 里有推理块时，核对后面各轮的 `md_call.request`  |
| [tools.mjs](tools.mjs)               | S4-1 | `Shell()` create_session 后同一会话 execute 两次，宿主上有第二条命令的产物 | 宿主文件系统                                              |
|                                      | S4-2 | 第二次继承第一次留下的工作目录                                             | 产物在第一条命令 `cd` 的目录里                            |
|                                      | S4-3 | 执行环境有命令记录；下一次请求里有结果块                                   | 域文件 `tl_record`；`md_call.request`                     |
|                                      | S4-4 | `Files()` read、write、精确 edit                                           | 宿主文件内容                                              |
|                                      | S4-5 | 下一次请求里有 `Files()` 的结果块                                          | `md_call.request`                                         |
|                                      | S4-7 | 长命令执行中取消 Run；之后没有新的模型请求与工具动作，已有结果可查         | `cancel-run` 的回复；取消前后 `md_call`、`tl_record` 行数 |
|                                      | S4-9 | 平台：本次平台上 S4-1～S4-7 全部通过                                       | `--platform` 标注，核对与本机一致                         |

不在本目录的判据脚本：S3-4（200 轮）的判定归 L-ENG 的 E9 设施，本目录只给它的适配器，见下文「E9 适配器」；S4-6（被有效禁止的动作 `denied`，B-APP 产出观察物）、
S4-8（只中断一个调用）。它们没有脚本，也就不会被报成通过。

## 命令

```sh
node tools/joint-b/conversation.mjs [--definition <名>] [--model-source real|replay] [--evidence <目录>] [--keep]
node tools/joint-b/tools.mjs [--definition <名>] [--platform windows|linux] [--model-source real|replay] [--evidence <目录>] [--keep]
```

先构建（同联调 A）：

```sh
pnpm --filter @omne-harness/harness-server... run build
pnpm --filter @omne-harness/cli... run build
```

- [operator.mjs](operator.mjs) 是联调 B 的运维者层：在联调 A 那份之上补模型、Context、工具、Session 适配行的
  数值（抄自 `apps/harness-server/tests/r9/support.ts`）。联调 A 那份缺这些行，`serve` 装载时
  model-records、request-context、session-ad03、session-ad04 会 FAILED，树起不来，注册、登录、建会话全部
  退出 5。新行要运维层数值时在这里补。
- 入口开头调用联调 A 的 `holdTestSlot`，先取机器运行名额。公共件从 `../joint-a/support.mjs` 复用，
  `support.mjs` 只加联调 B 自己的部分。
- `--model-source`：树上模型侧已全是真件时，发消息会触到真实模型或回放，要有授权。不给这个参数，
  相关步骤记等件，不发消息。它只标注证据。树上还有替身行时脚本照常发消息（打不到真实模型），
  观察只作参考写进等件。
- `--definition`：建会话用的定义，默认 `coding`。`assistant` 没有 `initialModelSelection`，拿不到回复，
  也没有工具引用，S4 无工具可调，所以不再作默认值。
- `--platform`：只标注证据，并核对与本机一致，不一致记失败（避免证据标错平台）。跨平台由调用方
  在 Windows 宿主与 WSL 独立检出上各跑一遍，分别报告；没跑的一侧不算通过。
- 单轮回复等待上限默认 90 秒，用 `OMNE_JOINT_B_REPLY_MS` 调。

## 判定、退出码与证据

每一步有三态：**通过**、**失败**、**等件**。等件写明等哪一件。观察不到的一律等件，不假通过：
树上相关行还有替身时，观察只写进等件的说明；表不存在、请求原文没有保留、模型没有返回推理块，也都是等件。

| 退出码 | 含义     |
| ------ | -------- |
| `0`    | 全部通过 |
| `1`    | 有失败   |
| `3`    | 只剩等件 |

证据写在 `tmp/m2-joint-b/<脚本名>/<脚本名>.json`（`--evidence` 可改）。`tmp/` 不入库。
构建产物不在时不崩：每步记等件，退出码 `3`。

## 当前预期

**在当前树上，预期结果是缺件时退出 3（等件），不能假装通过。** 只要 `MODEL_SIDE`／`TOOL_SIDE` 范围内还有替身行，
相关步骤就只记等件，观察到的东西写进等件说明。脚本认替身行靠 `implementation !== 'real'`，范围正则见
`support.mjs` 的 `MODEL_SIDE` 与 `TOOL_SIDE`（已含 `session-conditions`，随 `apps/harness-server/src/s0/stubs.ts`
的行表同步）。

### S2～S4 依赖哪些行是真件

依据 Reduce 的可达性调研 `tmp/m2-reduce/wave2/reduce/c1-reachability.md` 第 2 节（任务材料，不入库；`coding` 定义下）：

- S2、S3（单轮到多轮回复、Model 账目、Journal 条目）：`session-conditions`（SC1）、`agent-host`、`agent-instances`、
  `session-ad14`（SC4），`agent-model-selection` 能解析到会话（G-SELECT），`agent-context` 第六组工具来源能收
  非空 bindings（G-TOOLS6，`coding` 引用 Files 与 Shell），以及模型目录与 `model-host`、真实模型或获准回放的授权。
  `session-ad11`、`session-ad15` 仍是替身时不挡这几步。
- S4-1～S4-5：在上面之外加 `tool-records`、`tool-runtime`、`tool-executor`、`tool-instances`、`tool-environments`
  和 `execution-environment`、`execution-files`、`execution-command`、`execution-host`（Tool 段），以及
  `authorization` 对 Files、Shell 的动作准入。
- S4-7：再加 Journal 的取消治理安装（G-CANCEL），和 Run 标识的读口（下节）。

### S4-7 的 Run 标识

`cancel-run` 要 `--run <id>`。目前唯一的公开读口是 `read-history`：Session 契约在启动 Run 时写一条
`run.started` 条目，载荷里有 `run`。`read-history` 默认只列 `message.user` 与 `message.assistant`，所以
`tools.mjs` 在运维层把 `server-entry` 的 `historyKinds` 加上 `run.started`（`startTree` 的 `historyKinds`
选项）。CLI 没有读命令，SDK 也只有同一组会话操作，`send-input` 的成功输出只有 `recovered`。读不到该条目时
S4-7 记等件，不猜 Run 标识。

具名缺件：条目载荷里 `run` 的形状按 `session-contract` 的 `run.started` 取；真实会话提供方换上以后，
要在首跑时核对 `read-history` 确实给出这类条目。

当前发行树多数行仍是替身，跑出来应以等件为主。主要等的件：

- S2、S3、S4 的真实回复与 Model 账目：L-RUN 的 AD-02 与 session-ad* 真件、L-MODEL 的 model-host 真件，
  以及真实模型或获准回放的授权。
- S3-2「历史页读取次数」：L-RUN 在历史页读取处发出的计数事件。读取次数是进程内计数，域文件里没有，
  本脚本接不到，等 L-RUN 给出可读的观察来源后再接进来。
- S4-3、S4-7 的命令记录：L-TOOL 的 `tl_record` 落盘。
- S4-7 的 Run 标识：`read-history` 读到 `run.started` 条目（见上节）。
- S4-9：Windows 侧另等 T-D Windows 后端，Linux 侧在 WSL 独立检出上跑。

## E9 适配器（S3-4，R2-D177）

[e9-adapter.mjs](e9-adapter.mjs) 是 `tools/e9/cli.mjs run` 的适配模块。它在 L-RUN 的 line-through 世界上逐轮驱动输入，
把成员与替身的测量事件交给 E9 的按轮采集器。

**声明边界：首测组合是 line-through，不是发行组合。** 世界里 Session、Context、Agent、sqlite 存储和
AD-02、AD-04、AD-05、AD-06 是真实成员。Model 与 Tool 是世界自己的脚本替身，Model 请求准备、K-RQ 的部分持有者、
Runtime Context 交接是世界的替身。这次测量的结论只对这个组合成立，不能写成发行树的 E9 结果。发行组合缺少交入观察者
和固定延迟替身的装配入口，记为具名缺件 C1-E9-SEAM，移到波 3。

### 命令

```sh
OMNE_TEST_SLOTS=1 OMNE_TEST_SLOT_DIR=<共同名额目录>   node tools/e9/cli.mjs run --root <检出绝对路径> --out <新归档目录>   --adapter <检出绝对路径>/tools/joint-b/e9-adapter.mjs --timeout-ms <总时限毫秒>
```

| 环境变量           | 含义                                                              | 缺省   |
| ------------------ | ----------------------------------------------------------------- | ------ |
| `OMNE_E9_ROUNDS`   | 计划轮数，1～200。少于 200 轮时后窗缺失，总判定是等件             | 200    |
| `OMNE_E9_SHAPE`    | `tool`：每轮两次模型调用夹一次工具调用；`plain`：每轮一次模型调用 | `tool` |
| `OMNE_E9_ROUND_MS` | 单轮等新终态的上限，毫秒                                          | 60000  |

越界或不是整数的值使 `open()` 失败，不换成缺省值。

### 每轮做什么

1. 采集者开轮，读轮起点。
2. 调世界的 `runRound`：经 intake 面交入一条固定输入，轮询 `probe.readWork` 直到出现新的 `run.terminal`。
3. 适配器包住同一个 `probe.readWork`。第一次读到新终态时，在这次读取返回处调用 `observeTerminal`（R2-D62 D7）。
4. 读 `logCount`，见下节。
5. `finishRound` 后返回 `roundEvents`。投影有诊断时抛错，这一轮记失败。

读不到新终态时，包括 `runRound` 超时、返回了但没有读到新终态两种情况，`nextRound` 抛错，不交出轮完成，
运行退出 `1`。终态结局不是 `completed` 时，投影记 `round-outcome-not-completed`，同样退出 `1`。

外部等待：世界的脚本替身自己不等（`delayMs: 0`），每次调用的等待交给 L-MODEL 的 `createMeasuredFixedDelayModel`
与 L-TOOL 的 `createMeasuredFixedDelayTool` 执行，各 100 毫秒。替身用采集者的钟，所以等待与轮区间同进程、同钟、
同代次。世界等这个等待结束（`hold`）后才交结果。Model 请求准备段由 `measureModelPreparation` 包住世界的准备服务得到。

### logCount 的读法

经进程内 Session history 读面（世界的 `probe.history`）从头读到底：`begin` 的 `kinds` 为空表示全部类别，
沿 `next` 翻页，按条目标识去重计数。`annotations` 是别的条目的标注，不另计。它不碰存储形状。
读失败、抛错或翻页不收敛时，`logCount` 记未测量，投影记 `log-count-unmeasured`，不编数。
这次读取在终态观察之后、封轮之前，不在轮区间内，但会让下一轮晚开始。每轮全量读一遍，读取时间随条目数增长。
探针读口不经 Session 实例，所以不产生 Session 段事件。
`kinds` 为空表示全部类别，这是 session-storage-sql 读口的现行行为（`worker/read-history.ts`）；契约没有写明这一点。

### 依赖的内部文件与失效表现

本适配器以测量设施身份，用相对路径只读导入下列测试文件，不改它们：

| 文件                                                                 | 依赖什么                                                                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/agent/agent-host-local/tests/line-through/w2-world.ts`     | `openW2World` 的选项（`model`、`tool`、`earlier`、`receiverRecords`）与返回值的 `startRecording`、`runRound`、`createSession`、`probe`、`ctx`、`close`；`replyText`、`toolCallBlock` |
| `packages/agent/agent-host-local/tests/line-through/world.ts`        | `intakeAccess`、`SESSION`                                                                                                                                                            |
| `packages/model/model-host-local/tests/support/model-measurement.ts` | `createMeasuredFixedDelayModel`、`measureModelPreparation`                                                                                                                           |
| `packages/tool/tool/tests/support/tool-measurement.ts`               | `createMeasuredFixedDelayTool`                                                                                                                                                       |

适配器还依赖世界的三处运行时形状：

- `startRecording()` 返回的记录器在每次事件时现取 `observe` 属性。适配器把它换成采集者的 `measure`，把 `stub` 换成空函数，
  世界自己的 `scripted-*` 等待记录不再进入测量。
- `ctx.get('modelRequestPreparation')` 的 `prepare` 是实例字段，Context 每次调用时现取。
- `probe` 对象的 `readWork` 可以替换，世界的 `runRound` 每次轮询时现取它。

导入失败、上述属性缺失时，`open()` 抛错，运行退出 `1`，`adapter-result.json` 记首个错误。换属性失效但没有报错时，
例如世界改成在闭包里直接持有观察者，成员段就不会进入采集者：段记未测量，总判定是等件，不会是通过。
世界的源码是 TypeScript。适配器在自己的进程里注册解析钩子，取包的 `source` 导出条件，并把 `.ts` 文件里写成
`.js` 的相对导入回落到 `.ts`。这与 vitest 的解析对应，不写任何文件。

### 退出码与证据

退出码沿 E9：通过 `0`，失败 `1`，参数错误 `2`，等件 `3`。Windows 上没有 fsync 来源，完整 200 轮的总判定
也只能是等件 `3`。fsync 的真实计数等 Linux strace 首测与轮关联（R2-D17），本适配器不提供。
逐轮投影在归档的 `projection.jsonl`，轮外事件在 `projection-strays.jsonl`。
本适配器的轮驱动单测：`node --test tools/joint-b/e9-adapter.test.mjs`。它们用替身世界，不证明真实世界的行为。

## 已知限制

- 历史条目的载荷形状归 Session 契约。脚本按条目类别与载荷里的 `assistant` 等字样认回复，认不出就当没有回复。
- 工具结果块按请求文本里同时有命令（或文件名）与 `tool_result`／`function_call_output` 字样认。
  认法写在步骤说明里；供应商请求形状改了要同步这里。
- 脚本用提示文字让模型调工具，真实模型有不确定性；获准回放时按回放记录走。

## 归属

本目录归联调轨道，依据同 [联调 A](../joint-a/README.md#归属)：路径按 `docs/engineering/integration.md`
「线与归属」的目录前缀匹配，`tools/` 本身列在 `engineering-toolchain` 线下，所以选 `tools/` 之下一个
表里没有的目录，不动工作区与锁文件。交付线为 `integration` 的卡写入此处时，route 用 `cross-track`，
具名联调轨道与 `engineering-toolchain` 线的 owner。

本目录只读实现：起进程、发请求、读 stdout 的 JSON 记录、只读打开 SQLite 域文件，
不写产品源码，也不改发行配置。例外是 E9 适配器：它在进程内装配 line-through 测试世界和两个 measured 替身，
只读导入测试文件，不改它们。
