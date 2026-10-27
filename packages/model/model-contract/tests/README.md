# model-contract 测试

本目录拥有可重复执行的测试与验证设施。设施说明、运行命令和未覆盖范围见[验证说明](../verification/README.md#持续验证设施)。

| 文件                                                                                  | 作用                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exports-inventory.ts`、`exports.spec.ts`、`exports-inventory.spec.ts`                | 比对构建产物与导出清单，并证明比对能发现漏导出、多导出、种类错误和过期的 `pending`；另核对 `pending` 总数                             |
| `install/`、`install-judgment.spec.ts`、`closure-judgment.spec.ts`                    | 安装闭包设施（含 `--fixture` 夹具模式与 `fixtures` 入口），及其纯判断的负例（快层）                                                                                                                                              |
| `install-closure.spec.ts`、`install-probe.spec.ts`、`install-consumer.spec.ts`        | 禁止依赖、`--work-dir` 护栏、离线失败负例，祖先 `node_modules` 越界负例，以及对未修改成员的真实打包与安装，含消费工程只依赖目标成员一项（慢层，起子进程）。创建的 `tmp/install-closure/` 目录在 `afterAll` 里删除 |
| `install-scenario.spec.ts` | 闭包设施的 `--scenario` 步骤：脚本在消费目录里运行、不带继承的模块路径、退出码决定 `scenario-run` 检查；场景能导入目标成员以外的闭包成员；只在给出场景时才要求该检查项（慢层，起子进程，创建的目录在 `afterAll` 里删除） |
| `install-fixture-judgment.spec.ts`、`install-fixture-set.spec.ts` | 角色夹具步骤的纯判断（快层）：夹具清单的读取与每种拒绝原因、声明的包与闭包的关系、夹具自带禁止名并入策略、安装后的禁止判定（只在安装集合里出现的禁止包，含夹具自己禁止的名字）、直接依赖的映射与无单一版本的报告、夹具进程报告的读取与判定、设施入口所打印报告的读取守卫（`install-reports.ts`）、夹具检查项并入必需项；整组运行的汇总（必需角色缺夹具、角色名不符、单个夹具红、没有夹具、角色清单不可用） |
| `install-fixture.spec.ts` | 角色夹具步骤在手工搭建的消费工程里必须拒绝的输入（慢层，起子进程）：夹具导入未声明的包、类型不符、依赖只由消费目录之上的 `node_modules` 满足、没有失败路径、失败路径没有决策、路径抛错、解析跑出消费目录或落在源码、角色名不符、导出形状不对、路径没有 `run`、导入失败、路径超过时限被杀掉、不传时限时用默认值、子进程超时被杀（时限失效时用例变红，不挂住工作进程）；经 CLI 的拒绝在打包之前发生：夹具声明闭包外的包、夹具禁止它自己要的包、目录缺文件、`--fixture` 与 `--scenario` 同用；`fixtures` 入口对缺角色与夹具红的退出码 |
| `fixtures-run.spec.ts` | 本成员五个角色夹具经 `fixtures` 入口的真实运行（慢层）：从构建产物打包、离线安装、在各自消费目录里编译并运行；汇总 `ok`，角色恰是 `roles.json` 的五个，每个角色有正常路径和写明决策的失败路径，夹具源码目录里没有安装出的 `node_modules`；本次运行用自己的工作目录（`--work-dir`），只删自己建的目录，不删与别的成员共享的父目录 |
| `facility-sync.ts`、`facility-sync.spec.ts`、`facility-members.spec.ts` | 两个契约成员的安装闭包设施逐字节相同：比较器的负例（字节差一位、只有一边有的文件、缺夹具运行器）在快层；对真实的 model-contract 与 model-cordis-contract 比较在慢层，因为它读另一个成员的文件，差分变异只拷贝一个成员 |
| `declaration-leaks.ts`、`declaration-leaks.spec.ts` | 构建出的入口声明里，公开名字的签名不引用本文件未导出的本地类型名：函数的三个正负例，以及对两个入口的真实检查（读 `dist`，沿入口的 `export ... from` 找到各声明文件）。签名泄漏本文件导出但入口未导出的名字，不在这条检查内 |
| `type-assertions.ts`、`type-assertions.spec.ts`                                       | 品牌值不用类型断言构造的检查；带 `brand-mint:` 的豁免点最多一处                                                                                                          |
| `public-api-types.spec.ts` | `docs/public-api.md` 是源码导航：清单的每一章链接声明其名字的源码文件，页面链接的源码与测试文件都存在，页面不重复声明（核对函数及其负例在 `exports-inventory.ts` 与 `exports-inventory.spec.ts`） |
| `*.spec-d.ts`、`values.ts`、`type-coverage.spec.ts`                                   | 类型消费的正例与负例；探针的类型化输入；每个已落地类型至少在一个探针里被使用（导入列表里的名字不算）                                                                                |
| `fixture-runner.ts`、`fixture-runner.spec.ts` | 角色夹具的声明规则：要求每个夹具声明正常路径与失败路径、失败路径写明改变的协调决策、路径名不重复、必需角色有夹具。设施用同一份规则判定夹具进程写出的报告 |
| `public-entry.spec.ts`、`identity.spec.ts`、`credential.spec.ts`                     | 根入口的 20 个运行时键、`./provider` 的 14 个运行时键，以及两个入口的全部名字（类型与值）「一名一入口」；身份与序列解码函数的成功与每个拒绝原因、比较函数、守卫派生函数；凭据解码函数的成功与每个拒绝原因，以及持有者比较函数                                         |
| `replay.spec.ts` | 回放声明（经 `judgeReplayDeclaration`）的展开默认值、存储形状与每个校验失败；回放投影对每个可续接条件、只含 `thinking` 的消息、无 `replay` 的消息、三种 `foreignThinking`、A→B→A 历史和诊断键集合的结论；`continuedMessages` 与再发 |
| `testing-entry.spec.ts`、`testing-provider.spec.ts`、`testing-failures.spec.ts`、`testing-access.spec.ts`、`testing-observation.spec.ts`、`testing-control.spec.ts`、`testing-transport.spec.ts`、`scripted-support.ts` | `./testing` 的受控替代提供者与替代传输，经包名入口导入：运行时键（只有替身与替代被测方）、普通路径、认回与冲突、六种失败路径、逐动作撤权与跨租户拒绝、等待中的观察被唤醒与释放、取消的三态、多调用、对脚本误用的拒绝、传输的终止、耗尽、抛错与调用计数。`scripted-support.ts` 是它们共用的输入构造 |
| `testing-reduction.spec.ts` | 替代提供者喂入上游事实时的块表（追加与替换、禁止的转换、封口与累计值、截断的工具参数）、证据登记与目录故障 |
| `conformance-scripted.spec.ts`、`conformance-admission.spec.ts`、`conformance-settlement.spec.ts`、`conformance-control.spec.ts`、`conformance-observation.spec.ts`、`conformance-routes.spec.ts`、`conformance-transport.spec.ts`、`conformance-entry.spec.ts`、`conformance-docs.spec.ts`、`conformance-exports.spec.ts`、`conformance-kit.spec.ts`、`conformance-defaults.spec.ts`、`conformance-support.ts` | `./conformance` 的提供者符合性断言（`conformance-exports.spec.ts` 核对该入口的运行时键，只有套件、没有替身）：替代件通过全部义务，替代件的钩子接线各有直接断言；每条义务有一个只违反它的提供者让它失败，同一义务的其他违约方式与契约允许的另一种形态（应当通过）各有变体，失败总带原因（`conformance-support.ts` 把替代件包成坏提供者并读出失败的义务与原因）；入口对缺钩子、抛出的错误、超时与释放的处理；套件自带辅助函数的直接断言（`conformance-kit.spec.ts`）；套件缺省值送到提供者与传输的内容（`conformance-defaults.spec.ts`）；公开页的义务表与套件一致 |

`src/` 导出的类型声明和运行值与清单一致，清单没有 `pending` 名字；`pending` 标记留给以后新增而未落地的名字。这些测试不证明协议或生产能力。替代提供者的测试只证明外部协调者在契约面上看到的结果，脚本给出的结果不是生产证明。这些测试的用例名写成字面量，不用 `it.each` 或循环生成：差分变异（`pnpm run mutation`）按静态解析挑用例，运行不到名字动态生成的用例，会把本该被杀的变异体报成存活。

[目录索引](index.md)。

[judge-request.spec.ts](judge-request.spec.ts) 验证公开封闭判断、领域联合、单快照、不可变输出和七项预算。[judge-request.spec-d.ts](judge-request.spec-d.ts) 保持 typed Access 与未知 payload 的边界。
