# Model 持续验证资源

本目录维护契约场景、类型消费检查和模型验证的持续义务。行为唯一正文归 [SPEC](../SPEC.md)，本目录不授予设计接受，也不表示行为测试已经通过。

CAP-MD01 至 CAP-MD13 的接受状态与阶段承诺以[产品正文](../../../../.meta_harness/design/product/model-invocation/design.md#阶段与版本支持承诺)为准。技术缺项和未运行的验证不改变产品正文规定的范围。

当前只有验证要求与前提说明，没有本目录可执行的协议模型或证明。具体运行、临时探针和逐轮评审证据归任务 tmp。后续资源须记录真实依赖、性质、命令、覆盖及限制，不能用静态类型或模型枚举替代提供者故障验证。

目录导航见 [index](index.md)。独立验收归 [acceptance](../acceptance/index.md)。

产品与设计逐项对应见[能力覆盖](#model-产品能力与设计覆盖)。

## 持续验证设施

设施放在 `tests/`。验证说明放在本页，因为模板的 `verification/` 只接受 README、index、models 和 proofs。场景、能力覆盖与类型消费检查是本页后面的独立章节。设施只证明下表"能发现"一列。它们不证明行为已实现。

| 设施                     | 位置与命令                                                                                                                                                                                                          | 能发现                                                                                                                                                                                                                                                        | 发现不了                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 导出清单比对             | `tests/fixtures/exports.json`、`tests/exports-inventory.ts`、`tests/exports.spec.ts`。运行 `pnpm --filter @omne-harness/model-contract test`                                                                        | 漏导出、多导出、值与类型种类错误、清单标 `pending` 但产物已有、`package.json` 增加入口而清单没有、`pending` 总数与 `expectedPending` 不符                                                                   | 声明的形状与行为                                                                                            |
| 安装闭包                 | `tests/install/`、`tests/fixtures/install-policy.json`。运行 `pnpm --filter @omne-harness/model-contract run install-closure --out <报告.json>`；加 `--fixture <夹具目录>` 时改为运行一个角色夹具                                                                     | 生产依赖闭包里的禁止包、`workspace:` 等协议残留、制品带源码、入口解析（含 CommonJS `require`）或类型解析离开消费目录、声明在独立目录不能编译、离线安装失败（除非明示允许联网）、消费目录越界或删除无标记的目录                                                | 类型面以外的语义；制品在生产环境的运行                                                                      |
| 类型断言检查             | `tests/type-assertions.ts`、`tests/type-assertions.spec.ts`                                                                                                                                                         | `src/`、`src/testing` 与 `tests/fixtures/` 里用类型断言铸造品牌值；带 `brand-mint:` 的豁免点多于一处，或有豁免点在 `src/` 之外                                                                                                                     | 其他位置的断言；断言之外的越权构造                                                                          |
| 页面作为源码导航的检查 | `tests/public-api-types.spec.ts`（对真实页面与清单）、`tests/exports-inventory.ts`（`declaredNames`、`publicApiChapters`、`navigationProblems`）、`tests/exports-inventory.spec.ts`（核对函数的负例）。运行 `pnpm --filter @omne-harness/model-contract test` | 清单列出的章在页面缺失；章没有链接任何存在的 `src/` 文件；章链接的文件都不声明该章的某个名字（页面漏指、指错文件）；页面链接的源码或测试文件不存在（文件改名）；页面的 TypeScript 代码块声明了清单里的名字（带不带 `export` 都算） | 声明的形状（归类型探针 `tests/*.spec-d.ts`）；章里文字对行为的描述；章链接的文件声明了名字不等于名字被入口导出（归导出清单比对） |
| 类型探针与覆盖下限       | `tests/*.spec-d.ts`、`tests/values.ts`（探针的类型化输入，只声明不构造）、`tests/type-coverage.spec.ts`                                                                                                             | 类型消费文档的正例与负例（`@ts-expect-error`）；清单里每个已落地的类型至少在一个探针里被使用（导入列表、注释和字符串里的名字不算）                                                                                                                            | 探针以赋值为主，看不到多出的可选成员、变宽的联合和丢失的 `readonly`，这些现在没有机器检查                   |
| 受控替代提供者 | `src/testing/`、`tests/testing-*.spec.ts`、`tests/scripted-support.ts`。运行 `pnpm --filter @omne-harness/model-contract test` | 外部协调者在六种失败路径（提交未知、无活体路由、陈旧实例、失权、重复 ACK、断流）上依赖的可观察结果：认回与冲突、观察结束原因、读取与确认的结果、取消三态与迟到结果、传输的终止、耗尽与抛错 | 生产提供者的真实发送、持久化与恢复；脚本给出的结果不是生产证明 |
| G4 不变量追踪 | G4 的 22 个短语逐条对应测试名；新增的两条行为断言是 `tests/testing-provider.spec.ts` 的 `serves the blocks across its pages in the order they were given, under rising indices` 与 provider-author 夹具的 `a meter that only has a tokenizer gives no measurement of the request and the assembler does not judge from it`。运行 `pnpm --filter @omne-harness/model-contract test` 与 `... run fixtures`。状态汇总见[不变量覆盖（G4）](#不变量覆盖g4) | 块顺序与分页顺序不一致；只持有 tokenizer 的计量器给出完整预算，或组装方据分词计数判断压缩 | 五项全部或一半不在契约包内可观察，见[不变量覆盖（G4）](#不变量覆盖g4)的未覆盖列表 |
| 提供者符合性断言 | `src/testing/conformance*.ts`、`tests/conformance-*.spec.ts`、`tests/conformance-support.ts`。运行 `pnpm --filter @omne-harness/model-contract test`，详见[符合性断言](#符合性断言) | 一个被测方在公开面上违反契约义务的 52 种情形：认回与冲突、保留值、提交未知、先证据后确认、重复确认、读取与确认的先后、取消、观察的结束原因与块的归约、租户与资格、路由、`quiesce`、传输的发送时机与终止；替代件通过全部义务，每条义务有一个只违反它的提供者让它失败 | 生产提供者的真实发送、持久化与恢复；契约没有给出失败 kind 或判据的义务只做较弱断言；被测方不给义务需要的钩子或传输、或结果只有一页时，相应义务报告 `not-applicable`（三个来源见公开页）；已收场调用的终局不反转、取消后终局为 `interrupted` 这两件事的一半在公开面看不到，列入弱断言清单 |
| 角色夹具 | `tests/fixtures/consumers/<角色>/`、`tests/fixtures/consumers/roles.json`、`tests/install/fixtures.ts`（整组入口）、`tests/install/fixture-*.ts`（设施）、`tests/fixture-runner.ts`（声明规则）。运行 `pnpm --filter @omne-harness/model-contract run fixtures`，详见[角色夹具](#角色夹具) | 五个角色（独立调用者、编排协调者、Context、结果消费者、通用提供者作者）只靠已打包安装的公开制品就能完成各自的消费：夹具导入未声明的包、编译失败、解析离开消费目录、缺正常路径或失败路径、失败路径没有写明改变的协调决策、路径名重复、路径抛错、必需角色缺夹具，以及夹具依赖了闭包之外的包或本角色禁止的包 | 夹具里的替代件由脚本给出结果，不证明生产提供者；Context 的档案、准备、计量与转换服务是夹具自己的替身；未列入夹具的角色（Cordis 消费插件归 model-cordis-contract） |

### 导出清单

清单读取构建产物 `dist/*.d.ts`，不读源码文本。比对使用 `@typescript/typescript6` 的编译器 API。它解析 `export *`，所以 `index.d.ts` 只写 `export * from` 也能列出名字，并按符号标志区分类型与值。

`make declarations-check` 不能复用。它只把全部成员的 `dist` 声明交给 TypeScript 6 建程序，报告诊断，不枚举导出。

清单按 [public-api](../docs/public-api.md) 的章节分组，章里的名字由该章链接的 `src/` 文件声明。根入口共 169 项：151 个类型和 18 个值；`./testing` 入口 27 项：21 个类型、5 个值和 1 个类。每章数量如下。

| 章节                    | 项数 | 类型 | 值  |
| ----------------------- | ---- | ---- | --- |
| 根入口的值与请求        | 35   | 23   | 12  |
| 结果、失败和状态        | 18   | 18   | 0   |
| 普通调用面与实例观察    | 14   | 14   | 0   |
| 独立执行与提供者操作    | 29   | 29   | 0   |
| 消费者 owner 的装配声明 | 2    | 1    | 1   |
| 档案与请求准备          | 26   | 26   | 0   |
| 消息转换                | 9    | 9    | 0   |
| 文本分词与完整计量依据  | 5    | 5    | 0   |
| 受信宿主驱动            | 6    | 6    | 0   |
| 档案来源与准备资源      | 6    | 6    | 0   |
| 凭据引用与解析端口      | 11   | 8    | 3   |
| 供应商尝试诊断          | 8    | 6    | 2   |
| 受控替代提供者（`./testing`） | 14 | 11 | 3 |
| 符合性断言（`./testing`） | 13 | 10 | 3 |

public-api 有 21 个二级章节。清单列出其中 14 章：根入口 12 章，`./testing` 2 章。其余 7 章只指向 SPEC 或写归属说明，没有声明，清单不为它们造项。测试要求每个出现在清单中的章节非空，并解析 `docs/public-api.md`，核对该页是源码导航：清单列出的每一章链接至少一个存在的 `src/` 文件，这些文件声明该章的每个名字，页面链接的源码与测试文件都存在，页面的 TypeScript 围栏代码块（`ts`、`typescript`、`tsx`、`mts`、`cts`）不声明清单里的名字，带不带 `export` 都算；其他围栏和清单外的名字不检查。

每项有 `pending` 标记。`pending: true` 表示声明已接受但产物还没有。比对规则如下：

1. `pending: false` 的名字必须在产物里出现，种类相符。
2. `pending: true` 的名字必须不在产物里。已经出现就失败，提醒改标记。
3. 产物里清单没有的导出算多导出。
4. 测试输出每个入口的"已列出、待落地、已落地"计数，并要求 `pending` 总数等于清单顶层字段 `expectedPending`（现为 0：已落地 151 个类型和 18 个值）。落地名字的阶段在同一次改动里降低该值，删除名字或改回 `pending` 而不改它会失败。

`./testing` 入口已在清单里，章节名是「受控替代提供者」与「符合性断言」。再增加入口时，同时在清单里加这个入口，否则"清单覆盖全部 `exports` 子路径"的测试失败。

### 安装闭包

流程如下：

1. 从 `package.json` 读出生产依赖闭包（`dependencies`、`optionalDependencies`、`peerDependencies`），沿工作区成员递归，不用 pnpm，不联网。
2. 用 `tests/fixtures/install-policy.json` 检查禁止清单。命中就在打包之前失败，报告点名包、类别和依赖链。
3. 用 `pnpm pack` 打包闭包内每个工作区成员，检查制品：没有 `src/`、`tsconfig*`、非声明的 `.ts`，生产依赖里没有 `workspace:`、`catalog:`、`link:`、`file:`。
4. 在 `tmp/install-closure/<成员名>/project/` 写独立消费工程，只依赖本成员制品。其他闭包成员和第三方包用 `pnpm.overrides` 钉到制品路径和工作区锁定的精确版本。用 `pnpm install --ignore-workspace --ignore-scripts --offline` 安装。`--offline` 失败时整次运行失败，`install` 检查为不通过。只有调用者明示 `--allow-network`（或环境变量 `OMNE_INSTALL_ALLOW_NETWORK=1`）时，才会再用 `--prefer-offline` 重试，该次可能访问 registry。报告字段 `install.mode` 是 `offline` 或 `network`，`install.allowNetwork` 记录是否允许。
5. 安装后再列出实际安装的全部包，重新检查禁止清单，覆盖只有安装后才可见的传递依赖。
6. 在消费目录里用 Node 的同步解析钩子（`module.registerHooks`）记录每一次模块解析，ESM `import` 与 CommonJS `require` 都在内，逐个导入 `exports` 里带 `import` 条件的入口。每个解析结果的真实路径必须在消费目录内，不得落在 `src/` 或 `.ts` 文件。
7. 用 TypeScript 6 编译一个只导入全部入口类型的文件，`types` 与 `typeRoots` 为空，`skipLibCheck` 关闭。`--listFiles` 列出的文件必须在消费目录内，或属于编译器自带库。

报告是 JSON：`closure`（声明闭包）、`install`、`installed`、`forbidden`、`tarballs`、`probe`、`typeCheck`、`checks` 和 `ok`；给出 `--scenario` 时另有 `scenario`（脚本路径与输出尾部）；给出 `--fixture` 时另有 `fixture`（角色、目录与每条路径的结果）。退出码：0 全部通过，1 有检查失败，2 用法或工具错误。设施拒绝在设置了 `NODE_PATH` 的环境里运行。运行入口 `pnpm run` 不设置 `NODE_PATH`，但经 `pnpm exec` 启动的 vitest 会设置，所以测试给子进程去掉它。

可选参数 `--scenario <file.mjs>`：探针通过后，把脚本复制进消费目录，以消费目录为工作目录、用与探针相同的干净环境运行。非零退出使报告失败，检查编号 `scenario-run`，报告记录脚本路径与输出尾部；给出该参数时，必需检查项清单含 `scenario-run`。场景要导入的包不限于目标成员，所以给出 `--scenario` 时，消费工程把闭包里的每个工作区成员都声明为直接的 `file:` 依赖（pnpm 只链接直接依赖）。未给出时，消费工程只依赖目标成员，与此前逐字节相同。禁止依赖检查在两种情况下都覆盖完整闭包。编译器取自设施自己的 `@typescript/typescript6`，成员不必声明它。

`--work-dir` 受护栏约束：目录必须在成员的 `tmp/` 或仓库的 `tmp/install-closure/` 之下，不得是符号链接；目录已存在且非空时，必须带设施写入的标记文件 `.install-closure-consumer`。不满足时拒绝运行，退出码 2，不删除任何内容。`--store-dir` 指定另一个 pnpm 存储。

实测结论：

- `pnpm pack` 接受 `private: true` 的包。`catalog:` 被改写成精确版本，`workspace:*` 被改写成成员的版本 `0.0.0`。后者在独立目录里不能解析，所以设施把闭包成员用 `pnpm.overrides` 指向各自的制品。
- `exports` 的 `source` 条件原样留在制品里，指向没有发布的 `./src/...`。Node 和 TypeScript 的 NodeNext 解析忽略它。设施用"解析结果不得落在 `src/`"检查它没有被走到。启用自定义条件 `source` 的消费者会解析失败，这是已知限制。
- 消费目录位于仓库的 `tmp/` 内，祖先有 `node_modules`。设施不禁止祖先存在，而是证明没有任何解析落到消费目录之外。异步的 `module.register` 钩子看不到 CommonJS `require`，所以改用同步的 `module.registerHooks`，并有只存在于祖先 `node_modules` 的 CJS 与 ESM 依赖作负例。`registerHooks` 在 Node 24 与 26 上运行时不再触发 DEP0205。
- 消费目录里的 `pnpm ls` 要加 `--ignore-workspace`，否则 pnpm 会采用仓库工作区，列出空结果。设施另检查"闭包成员与第三方依赖都出现在已安装列表"，防止这种空列表让禁止清单检查落空。
- 第三方包的精确版本取自工作区安装结果，其他版本会让离线安装找不到 tarball。

两个成员各有一份 `tests/install/`，原因是 D-2 要求设施随成员维护，不建仓库级共享工具。两份逐字节相同，改一份时同步另一份。`@omne-harness/model` 的 `install-closure` 脚本调用本成员的这份设施，不复制它。

负例都在慢层（起子进程）：

- `tests/install-closure.spec.ts` 在成员清单的临时副本里注入 Cordis、`@omne-harness/model-host-local`、pi、厂商 SDK、分词引擎、存储引擎各一个，断言退出码为 1，报告点名被注入的包，且没有打包。真实的 `package.json` 不被修改。同一文件另证：`--work-dir` 指向成员目录、允许范围之外的目录或无标记的非空目录时退出码为 2 且内容保留，这几条都对测试自己在临时目录里造的成员运行，不指向任何仓库路径；用空的 pnpm 存储让 `--offline` 失败时，退出码为 1、`ok` 为 false、`install.mode` 为 `offline`。
- `tests/install-probe.spec.ts` 在手工搭的消费目录里证明：CJS 与 ESM 依赖只在祖先 `node_modules`、入口解析到 `src/`、声明依赖祖先里的类型，三种情况各自使对应检查失败；依赖放进消费目录的对照组通过。
- `tests/install-scenario.spec.ts` 在手搭的消费目录里证明场景脚本在消费目录里运行、退出码非零使 `scenario-run` 失败并保留输出尾部、导入消费目录没有的包失败，并对本成员做一次真实运行：场景导入目标成员以外的闭包成员（`@omne-harness/legal-identity`），消费工程的依赖恰为闭包里的全部工作区成员。
- `tests/install-consumer.spec.ts` 对未修改的成员做真实打包与安装，断言报告的检查项 id 与预期的完整集合相等、消费工程只依赖目标成员、`typeCheck.files` 大于 0、探针入口列表与 `exports` 一致，并在 `afterAll` 里删除它创建的 `tmp/install-closure/` 目录。

纯判断在快层的 `tests/install-judgment.spec.ts`：`inside`、制品源码、锁文件残留、解析与类型文件判断（含空列表必须失败）、`--work-dir` 护栏、联网回退决策（用替身运行器，不访问网络）、必需检查项清单。`finish()` 在所有检查通过但缺少必需检查项时，加入失败的 `required-checks` 并使报告 `ok` 为 false，所以漏接一个判断会使对真实成员的正例变红。

### 角色夹具

五个角色各有一个夹具，在 `tests/fixtures/consumers/<角色>/`：`independent-caller`（托管调用者或独立调用者）、`session-coordinator`（编排协调者，目录名沿用旧称）、`context`、`result-consumer`（结果消费者）、`provider-author`（通用提供者作者）。必需角色清单是同目录的 `roles.json`，清单里的角色缺夹具时整组失败。第六个角色 Cordis 消费插件的夹具归 model-cordis-contract。

运行整组：`pnpm --filter @omne-harness/model-contract run fixtures [--out <报告.json>] [--work-dir <目录>]`；`--work-dir` 默认是工作区 `tmp/install-closure/fixtures`，换成同一 `tmp/install-closure` 之下的别的目录时，同时运行的另一个成员或另一次运行互不删除对方的消费目录。先要构建闭包内的全部成员：`pnpm test` 只构建本成员，依赖成员在干净检出上须先用 `pnpm exec turbo run build --filter=@omne-harness/model-contract...` 构建；五个夹具逐个打包、离线安装并运行，约 40 秒。退出码：0 全部通过，1 有夹具失败或整组有问题，2 用法或工具错误。运行单个夹具：`pnpm --filter @omne-harness/model-contract run install-closure --fixture tests/fixtures/consumers/<角色> --work-dir <工作目录>`，退出码与报告同安装闭包；`--fixture` 不能与 `--scenario` 同用。

一个夹具的运行与成员模式的安装闭包用同一个设施，差别如下：

1. 读夹具的 `fixture.json`。缺文件、不是 JSON、没有依赖、没有 `role` 都使检查 `fixture-dependencies` 失败；声明的依赖不在成员闭包内也失败，且发生在打包之前。
2. 禁止依赖：成员策略叠加夹具自己的 `forbidden`（类别名 `fixture:<角色>`）。声明闭包只算夹具声明的包及其闭包（`forbidden-declared`），安装后再查实际安装的全部包（`forbidden-installed`，判定函数 `judgeInstalled`）。当前闭包里唯一的第三方依赖 `jsonc-parser` 没有传递依赖，安装集合等于声明闭包，所以真实运行造不出「只在安装集合里出现」的禁止包；这一步的负例在判定函数层（`install-fixture-judgment.spec.ts`），调用处的接线不被任何真实运行单独覆盖。
3. 仍打包闭包内每个成员，离线安装，但消费工程的直接依赖只有夹具声明的包：工作区成员用制品，第三方包用工作区钉成的唯一版本（`fixture-pins`，没有唯一版本就失败，不猜）。
4. 把夹具的 `.ts` 文件与 `tsconfig.json` 复制进消费工程，用夹具自带的编译选项对已安装的声明编译（`fixture-compile`）；编译加载的文件必须在消费目录内或属于编译器自带库（`fixture-type-resolution-inside-consumer`）。导入未声明的包，或只有消费目录之上的 `node_modules` 能满足的包，在这一步失败。
5. 在记录解析的钩子下运行编译产物。设施自带的宿主脚本 `tests/install/fixture-host.mjs` 导入 `fixture.ts` 导出的 `fixture`，按顺序运行每条路径，路径抛错记为该路径失败，把每条路径的名字、种类、决策、结果写进报告文件。进程须正常结束（`fixture-run`，默认 60 秒时限，由 `runFixture` 的默认参数给出，测试断言不传时限时用这个默认值）；每次解析必须在消费目录内、不落在 `src/` 或非声明的 `.ts` 文件（`fixture-resolution-inside-consumer`、`fixture-resolution-no-source`）。
6. 用 `tests/fixture-runner.ts` 的声明规则判定报告：缺正常路径、缺失败路径、失败路径没有写明决策、路径名重复、角色名与清单不符（`fixture-report`）；再判定每条路径是否通过（`fixture-paths`），两者分开报告。

夹具模式不运行成员的入口探针与类型探针，那是成员模式的事。整组报告含 `member`、`ok`、`problems`（清单不可用、必需角色缺夹具、角色名与目录名不符）和 `fixtures[]`；每个夹具有 `role`、`directory`、`ok`、`paths[]`（`name`、`kind`、`decision`、`ok`、`error`）与未通过的检查 `failedChecks[]`。每个夹具用自己的消费目录 `tmp/install-closure/fixtures/<角色>`，互不删除。

夹具的写法见[夹具目录说明](../tests/fixtures/README.md)。每个夹具至少一条 `normal` 路径、一条 `failure` 路径；失败路径是改变外部协调者决策的失败，`decision` 写明那个决策。各夹具的路径数以运行报告为准。

| 角色 | 正常路径覆盖 | 失败路径与决策 |
| --- | --- | --- |
| 独立调用者 | 固定请求以原 call 与 operation 受理并认回重复；经 `connect` 观察到收场；按精确版本分页读取并以 processed 证据确认。取消单列：请求与受理的控制和上游实际停止是两件事；同一调用的重复取消不论 operation 都返回首次的控制；传播不可用仍是请求，不当作调用失败；取消后到达的结果与费用被保管，调用不自动确认、不变成故障；取消一个调用不波及另一个 | 无权取消被拒，不留控制，不扩大权限，调用方不当作已取消；受理回复未知时按原受理 operation 查询，不另发调用（世界记录调用方发出的每一次受理，断言除原调用与原 operation 外没有别的受理，且只有那次重复被受理） |
| 编排协调者 | 以显式的主体、租户、调用与 operation 取消；无活体路由时 `connect` 回答 `no-live-route`，调用仍是原调用且没被取消；宿主在新实例上接续后连到同一调用；没有路由时取消照样到达调用 | 取消回复未知时用同一 operation 重发，不产生第二个控制（`applied` 与 `dropped` 各一）；目录不可达回答 `unavailable`，不当作无路由；别的租户的取消与不存在的调用被拒得完全相同；丢失路由之后查原调用，同一受理仍认回，不替换（世界记录协调者发出的每一次受理，断言除原调用与原 operation 外没有别的受理） |
| Context | 工具声明只含名称、说明与参数模式，原样进入请求；Context 从胜出档案读取窗口与压缩触发百分比，请求前用计量判断，输入恰在触发线时不压缩，准备不计量，固定请求不带预算，没有工具时不允许工具；图片引用保持引用，准备零读取；语音块换成转换件派生的文本 | Context 按自己的规则判断需要压缩时（本场景的 Context 替身以自己算出的触发线和计量器的上界判断，算法不归 Model），按自己的策略压缩后重新计量并准备，Model 不截断；压缩后仍超限则拒绝给原消费者，不准备传输（准备替身只计数、不自行拒绝，断言它一次没被调用；拒绝的失败 kind 不钉，见限度）；发送后以 `input-over-limit` 收场时，Context 压缩并以新调用身份重发，同一输入不重发；压缩到一条消息仍被拒则放弃；其他成因的失败原样交回，不压缩、不重发；计量器给出命名失败时，Context 不当作输入过大，不压缩、不丢弃历史、不准备，把失败交给消费者；预算缺 `input-tokens` 检查时，Context 当作未完成计量，不压缩、不准备 |
| 结果消费者 | 按精确版本分页读到完成；以 processed 或 retained 证据确认，调用状态显示回执；重复确认返回原回执，已确认的结果不再被领取；已开始的读在确认后仍可读，清理 `blocked` 与原因被显示，确认不回滚 | 收场前确认被拒，保管仍在 producer，收场后同一消费者可以确认；提供者不接受的证据被拒，保管仍在 producer，用真实证据重新确认成功；同一确认 operation 配别的证据是冲突，首个证据为准；确认回复未知时以同一 operation 与证据重复，不重新领取。前两条只断言「不成功、状态不变」，不钉失败 kind |
| 通用提供者作者 | 只依赖 model-contract 与 operation-result，实现传输、计量与 tokenizer 三个端口；传输通过 `checkModelProviderConformance` 的全部六条传输义务，装配方才采用；计量数词、保持待读媒体为 `deferred-media`、对超出 `context` 上界的输入照常给出带数值与上限的检查，由请求组装方判断；tokenizer 数词与特殊记号并点名不认识的记号；供应商的超限响应映射为 `input-over-limit`，只带供应商给出的数字；档案维护的更新时间由自己的时钟给出 | 在 `prepare` 就发送的传输、事实流不终止的传输，符合性断言报告失败并带原因，装配方不采用该提供者；只持有 tokenizer 的计量器不给完整预算（回答 `unsupported` 或 `unavailable`），装配方不据分词计数判断压缩，同一规则仍据完整计量依据给出的计数判断；状态码相同而成因码不同的拒绝不映射为 `input-over-limit`，状态码留作证据；档案维护检查 `context` 等有效性规则并列出违反的字段，不留档案；档案维护对重复 operation 返回原结果、不产生新修订，同一 operation 配别的变更是冲突且不改变档案；时间倒退的档案变更返回 `unavailable`（`clock`）且原档案不变；时钟读数不是时间时同样返回 `unavailable`（`clock`）且原档案不变 |

### 不变量覆盖（G4）

交接 G4 表的 22 个短语：17 个由契约包自己的测试覆盖，2 个只覆盖一半，3 个契约包不覆盖。覆盖只指契约包的类型负例、符合性负例、替代提供者场景与角色夹具；替代提供者与夹具里的替代件证明契约面上的可观察结果，不证明生产提供者。

- 已覆盖：缺租户、混用 call 与 instance、调用者取得发布权、未知提交保留原身份、不自动创建新调用、停止观察不等于停止执行、控制请求不伪造停止确认、先有证据再确认、清理不破坏有效读取、增量与累计快照分别表达、原块顺序、采用依据、完整计量、deferred-media、仅 tokenizer 字数不冒充完整预算、上游超限的映射与不重发、档案有效性与更新时间不倒退。
- 只有结构证据：Model 只消费中立声明与共享消息，工具建议不执行工具。依据是契约包的生产依赖没有 Tool 成员、`pnpm run lint:deps` 无违规，以及 Context 夹具的禁止清单含 `@omne-harness/tool*`。没有运行时负例，「建议之后没有任何执行发生」是 Model 实现与 Tool 成员的组合责任。
- 只覆盖一半（另一半交契约拥有者）：
  - 重复确认不重复转移：重复确认返回原回执已断言（`fails a provider whose repeated acknowledgement gives another receipt`）；转移本身在公开面看不到。
  - 只物化所选 ref：`prepare` 不读媒体由 Context 夹具断言；物化阶段只读所选 ref，因 `ModelMediaReader` 不在 `ModelTransport` 的签名上，套件观察不到。
- 未覆盖（契约包不覆盖，交契约拥有者）：
  - 伪造普通游标：`readNext` 的 `after` 是 `string`，没有用 `OutputCursor` 品牌，符合性套件也没有拒绝未发出 after 的义务；拒绝只在替代提供者的 `serves the same page for a repeated after and refuses an after it never issued` 上断言。
  - 首内容后的失败不重发：归 Model 实现的执行函数（[符合性断言的限度](../docs/public-api.md#符合性断言)）。
  - 附件地址只作文本：`ModelMediaReader` 不在 `ModelTransport` 的签名上，套件观察不到。
- 块顺序一条只在替代提供者上断言分页顺序，契约包没有「生产提供者的结果页保持原块顺序」的符合性义务。

### 角色夹具的限度

- 夹具里的替代提供者与替代传输由脚本给出结果，只证明协调者在契约面上看到的结果，不证明生产提供者的真实发送、持久化与恢复。
- Context 夹具的档案、准备、计量与转换服务是夹具自己的替身（契约没有它们的受控替代件），所以这些路径证明 Context 一侧怎样使用这些接口，不证明 Model 实现。准备替身只计数、不计量、不自行拒绝：计量替身拒绝的输入它照样准备，所以「仍超限则不准备」只在 Context 自己停下时成立，断言的是替身的调用次数为零，不是替身的第二次拒绝。
- 「Context 不在装配与准备时读取二进制」没有运行时观察：Context 一侧的代码拿不到传输，传输只交给夹具自己的准备替身，计数恒为零。这条排除靠结构证据：Context 一侧的代码（`context/context.ts`）只收到准备服务的签名（`Services` 里是档案、准备、计量、转换、发送五项），它的依赖与类型里没有传输，也不导入 `ModelMediaReader`；`fixture-compile` 要求它只用声明的包，读它的导入语句就能确认没有传输与 `ModelMediaReader`（没有设施单独检查这一点，由评审读导入语句核对）。各角色的路径在 `tests/fixtures/consumers/<角色>/fixture.ts` 的 `fixture.paths`，对应关系见[角色夹具](#角色夹具)的角色表。这是对代码结构的证据，不是对读取行为的观察。
- 通用提供者作者夹具实现传输、计量与 tokenizer 三个端口。存储与宿主端口（`ModelCommands`、`ModelInstanceHost`）是提供者内部的深接缝，没有夹具。传输由符合性断言检查，计量与 tokenizer 只由夹具自己的断言检查。
- 「不导入 ModelConfiguration、driver 或具体执行工厂」只在依赖层执行：`@omne-harness/model` 与 `@omne-harness/model-host-local` 被禁止。契约里的 `ModelDriver` 与 `ModelDriverHost` 是端口类型，不禁止；`ModelConfiguration` 不存在于契约包。
- 无权取消只断言 `denied`（页面 `unauthorised-cancel-denied` 规定），不断言 `action` 文本，页面没有规定它；跨租户的取消只断言与不存在的调用得到相等的失败值（页面 `refusal-hides-existence`），不钉 kind；收场前确认与提供者不接受的证据只断言不成功且保管不变（页面只写「拒绝」，未给 kind）。`ToolDeclaration` 的构造失败，以及伪证据与猜错结果版本被拒时的失败 kind，在页面上没有形态，所以没有对应的失败路径或没有钉 kind。这些列入契约缺口。计量能力不因超限失败，只报告；压缩到一条仍超上限时，Context 夹具给出它自己的 `too-large` 结果，不冒充 Model 失败。
- 失败路径的 `decision` 是给人读的说明，设施不做机器比对。每条失败路径自己的断言必须执行并检查它所说的决策（例如「查原受理、不另发调用」要断言查询得到原受理、重复受理认回原调用，且世界记录的全部受理里除原调用与原 operation 外没有别的——不是只查某一个猜出来的 operation）；这是评审时逐条核对的内容，不是机器保证。
- 设施按成员各自维护，`model-contract` 与 `model-cordis-contract` 的 `tests/install/**` 和 `tests/fixture-runner.ts` 必须逐字节相同，由 `tests/facility-members.spec.ts`（慢层）检查。

### 页面作为源码导航的检查

`docs/public-api.md` 不重复声明。每一章写这章给谁用，链接声明它的 `src/` 文件与对应的类型探针。`tests/public-api-types.spec.ts` 用清单 `tests/fixtures/exports.json` 作对照物，核对三件事：

1. 清单里每个名字，都由所属章链接的某个 `src/` 文件声明。"声明"指该文件有带 `export` 的声明，或用 `export { 本地名 as 新名 }` 引入新名字。只转发同名的 `export { 名字 } from` 不算声明，所以章必须链接真正声明名字的文件，不能链接转发它的入口文件。
2. 清单列出的每一章至少链接一个存在的 `src/` 文件。
3. 页面链接的 `src/` 与 `tests/` 的 `.ts` 文件都存在。

另有一条：页面里语言为 `ts`、`typescript`、`tsx`、`mts`、`cts` 的围栏代码块声明了清单里的名字（`type`、`interface`、`class`、`function`、`const`、`let`、`enum`、`declare`，带不带 `export` 都算），检查就变红，因为页面又成为第二份声明。清单外的名字（例如示例里的局部变量）和其他语言的围栏不检查。

`tests/exports-inventory.spec.ts` 用手工搭的小目录检查核对函数。它要求：各类声明与别名被识别、转发不算声明；章里的链接与代码块被读出，其他围栏里的内容不读；页面漏指声明文件、指错文件、链接已不存在的文件、章缺失、章没有源码链接、代码块声明清单里的名字（带 `export`、不带 `export`、围栏写成 `typescript` 各一例负例），都各报一项问题。在 `/tmp` 的包副本上，对真实页面做三种改动，`tests/public-api-types.spec.ts` 都变红：删去一章中一个声明文件的链接，把一章的链接改为别的章的文件，把页面链接的源码文件改名。

声明的形状不由页面与源码比较，由类型探针 `tests/*.spec-d.ts` 与导出清单比对承担。探针以赋值为主，看不到多出的可选成员、变宽的联合和丢失的 `readonly`。这一类漂移现在没有机器检查：源码是唯一副本，改它不再与第二份文本比较。

### 类型断言检查

共享的 oxlint 配置只启用 `correctness` 类别，其中没有标记类型断言的规则，所以用编译器 API 自写检查。它标记 `as T`、`<T>x` 和 `as unknown as T`，不标记 `as const`。例外只有一处：`src/mint.ts` 的 `mintIdentity`，须带注释 `brand-mint:`。全部身份解码函数与 `deriveGuardControlOperation` 都经它铸造，不增加标记。例外必须在 `src/`（不含 `src/testing`）。带标记的位置最多一处，`src/` 之外的标记也占名额；第二处标记使检查失败。

### 受控替代提供者

`./testing` 的受控替代提供者和替代传输由脚本给出结果，用来练习外部协调者对失败路径的决策。它们不模拟存储、围栏或执行代次，不核验请求内容，只核验脚本登记过的证据。因此下面的测试只证明协调者在契约面上看到的结果，不证明生产提供者的真实发送、持久化与恢复；脚本给出的 `not-committed` 不是存储的完整排除证明（SPEC 对 `query` 的要求）。「值」一列的 3 是两个函数和一个类。

| 情形 | 测试（文件 `tests/testing-failures.spec.ts`，除非另注） | 断言的可观察结果 |
| --- | --- | --- |
| 提交未知 | `a write whose commit is unknown` 下的各条；租户与所属调用在 `tests/testing-tenancy.spec.ts` | 写操作回答 `commit-unknown`；`queryCommit` 或同 operation 重试按脚本得到 `committed` 或 `not-committed`，`stays-unknown` 时一直 `unknown` 到重试；`applied` 的重试认回原结果，`dropped` 的重试成为首次受理；不产生第二个受理。脚本按（租户，动作，operation）建键：别的租户用同名 operation 既不消耗也不解除保持；别的租户、别的调用或不存在的调用来查，得到与从未发出过的 operation 深相等的回答 |
| 无活体路由 | `a call with no live route` 下的各条 | `withdrawInstance` 后 `connect` 回答 `no-live-route`，`inspect` 仍返回原调用；在途观察以 `unavailable` 结束；别的调用不受影响 |
| 陈旧实例 | `a stale instance` 下的各条 | `replaceInstance` 后旧句柄在途观察以 `stale-instance` 结束，之后新开的观察立即以同一原因结束；`connect` 给出新实例的句柄；原调用仍在 |
| 失权 | `a principal who lost access` 下的各条 | `revokeAccess` 后观察以 `denied` 结束，已开始的读以 `ended`、`denied` 结束，新的查询、读取、确认、取消、受理返回 `denied`；换一个调用名去查同一个 operation 也绕不过去；原调用仍在，其他主体照常 |
| 重复 ACK | `an acknowledgement sent twice` 下的各条 | 同参数重复确认返回原回执与当前清理状态；不同证据、不同结果版本或不同 operation 返回 `conflict` |
| 断流 | `an observation that is cut off`；`tests/testing-transport.spec.ts` 的 `a scripted transport that loses the stream` | 观察断开以 `unavailable` 结束，调用继续，可重新观察；传输的事实流可耗尽而无终止事实，或在最后一个事实后抛脚本给出的错误 |

正常路径、认回与冲突、保留值、租户隔离，在 `tests/testing-provider.spec.ts`；保留值先于资格与存在性检查、在每个方法上一致，以及提交未知脚本与提交查询的租户和调用归属，在 `tests/testing-tenancy.spec.ts`；逐动作撤权和跨租户拒绝在 `tests/testing-access.spec.ts`；观察的唤醒、结束原因与释放在 `tests/testing-observation.spec.ts`；取消的三态与迟到结果、重复取消返回原控制、无权取消、多调用互不影响和对脚本误用的拒绝在 `tests/testing-control.spec.ts`；传输的调用计数在 `tests/testing-transport.spec.ts`。

### 符合性断言

`checkModelProviderConformance`（`src/testing/conformance.ts`）对任意提供者逐条运行 52 条义务检查。义务名、依据条款与所需钩子见[公开页](../docs/public-api.md#符合性断言)。替代提供者自身必须通过它（AC-G3-6）。

| 要证明的 | 测试 | 能发现 |
| --- | --- | --- |
| 替代提供者与替代传输通过全部义务，没有 `not-applicable`；每个钩子的接线（运行、收场与分页、证据、清理）与传输的事实、计数各有直接断言 | `tests/conformance-scripted.spec.ts` | 套件新增义务而替代件不满足；替代件的改动破坏某条义务；钩子接线遗漏 |
| 套件自带的辅助函数：裁决原语的报错文字、标识与块的构造、场景构造（受理、运行、收场、确认、读取）、观察的释放与限时、计数读取 | `tests/conformance-kit.spec.ts` | 辅助函数把失败当成功、漏释放观察、留下计时器、吞掉请求的字段 |
| 套件缺省值（请求、消费者、容量、供应商）与被测方自带的值，怎样送到提供者与传输 | `tests/conformance-defaults.spec.ts` | 缺省值缺字段或自相矛盾；被测方自带的值被缺省值盖掉 |
| 每条义务能失败：一个只违反它的提供者让它报告 `fail`，其余义务照常；失败总带原因，测试对原因文字断言。同一义务有多种违约方式时各有变体（回复指名另一个调用或 operation、状态被拒绝却改变、读取永不结束等），契约允许的另一种形态（拒绝以失败或以结束给出、第二次 `start` 给空流）各有应当通过的变体。少数变体让一个坏提供者同时违反几条义务，名单与原因见表后；每条义务另有只违反它的提供者（`tests/conformance-docs.spec.ts` 机检），所以「每条义务能失败」不依赖这些变体。测试里写明一并失败的项 | `tests/conformance-admission.spec.ts`、`tests/conformance-settlement.spec.ts`、`tests/conformance-control.spec.ts`、`tests/conformance-observation.spec.ts`、`tests/conformance-routes.spec.ts`、`tests/conformance-transport.spec.ts` | 断言过弱：被测方违约而套件不报失败 |
| 每条义务都有这样的测试；页面的义务表与套件一致（名字与顺序，每个钩子缺失时报告不适用的义务集合） | `tests/conformance-docs.spec.ts` | 新增义务没有坏提供者；页面与套件漂移 |
| 入口的行为：`not-applicable` 的三个来源（缺钩子、缺传输、结果只有一页使三条读取义务无法检查），被测方抛出的错误（含非 `Error` 值）报为失败，对被测方的每一次等待（工厂、提供者方法、钩子、`dispose`、观察与事实流）以 `waitMs` 为限、超时报失败，工厂或 `dispose` 失败只让当条失败且两个原因都保留，每条检查一个被测方并释放，不留开着的观察，`waitMs` 校验 | `tests/conformance-entry.spec.ts` | 入口把缺项当通过、吞掉错误、泄漏观察 |
| 替代提供者喂入上游事实时的块表、证据登记与目录故障 | `tests/testing-reduction.spec.ts` | 块表接受契约禁止的转换；证据登记不生效；目录故障只对部分调用生效 |

同时违反多条义务的变体，测试都断言精确的失败列表：

- 另一租户取消、读取或确认成功（`conformance-routes.spec.ts`）：「跨租户拒绝」与「拒绝不暴露存在」读同一个答复，越权成功必使二者不同。
- 受理保留值，或重复受理指名别的调用（`conformance-admission.spec.ts`）：「保留值被拒」与「被拒的受理不形成调用」、「重复受理认回」与「提交未知保持 operation」各读同一次受理的结果。
- 取消回答另一个 operation 的控制，或不给控制（`conformance-control.spec.ts`）：提交未知后的重试与重复取消读同一个回复；不给控制还使「取消不声称停止」读不到控制。
- 提前确认被拒却移动保管状态、回执后显示 `producer`、确认时读被卡住（`conformance-settlement.spec.ts`）：成对的义务读同一个保管状态或同一个读取。
- 观察在第一项就结束、快照缺在途的块、追加块显示替换模式、`quiesce` 失败（`conformance-observation.spec.ts`、`conformance-routes.spec.ts`）：几条义务共用同一个观察入口、同一个快照读数或同一个方法。
- 传输的 `prepare` 或 `materialize` 失败、事实流挂起或不终止（`conformance-transport.spec.ts`）：六条（或其中四条）义务都经过同一步。

套件只证明公开面上可观察的义务，不证明生产提供者的真实发送、持久化与恢复，也不证明执行函数、重试与归约本身：首内容后失败不重发、断流收场为失败、同块填充方式不切换的终止方式归 Model 实现。契约没有规定失败 kind 或判据的义务，只做较弱断言，清单在公开页「符合性断言」一章的末尾。

### 未覆盖

- 夹具只有五类，第六类（Cordis 消费插件）归 model-cordis-contract，见[角色夹具的限度](#角色夹具的限度)。类型探针覆盖根入口全部 151 个已落地的类型名，不覆盖 `./testing` 的类型（后者只由导出清单比对核对名字与种类，由 `tests/testing-*.spec.ts` 的运行测试间接使用）；18 个运行值由 `tests/credential.spec.ts`、`tests/identity.spec.ts` 等运行测试。
- 清单比对不检查声明的形状。形状只由类型探针负责。页面不再保存第二份声明，所以没有页面与源码的形状比较。
- 类型探针以赋值为主：探针不拦多出的可选成员、变宽的联合和丢失的 `readonly`，这些现在没有机器检查。覆盖下限只要求每个已落地类型在某个探针里被使用，不要求使用得充分。
- 类型断言检查只扫描 `src/` 与 `tests/fixtures/`，探针 `tests/*.spec-d.ts` 不在其中，探针靠 `tests/values.ts` 只声明不构造品牌值。
- 安装闭包只证明依赖与解析，不证明运行行为。
- 离线安装依赖本机 pnpm 存储里已有的精确版本。存储里没有时，运行失败并在 `install` 检查里说明；设施不会自行联网。`--allow-network` 路径只由替身运行器的单元测试覆盖，没有真实联网的运行。
- 联网回退之后的检查（解析、类型）与离线路径相同，但回退本身访问的 registry 内容不被设施校验。
- 检查项是否接进报告由对真实成员的正例核对（完整 id 集合与 `finish()` 的必需项判定）。但判断函数收到的输入是否真实不在其内：`tarball-no-source` 与 `consumer-lock-no-workspace` 的判断函数有负例，若流程把空文件列表或空锁文件传给它们，检查项仍会出现并通过，正例不会变红。

## Model 持续验证场景

本节维护档案、模态、结果承接和成本的持续验证义务。场景不构成实现通过证据，行为唯一正文归 [SPEC](../SPEC.md)。

### 契约包隔离与迁移

目标边界见[组架构](../../docs/architecture.md#契约包的公开边界)。这些是两个契约包的验收条件。包隔离由安装闭包设施对打包产物验证，范围见[验证说明](#持续验证设施)。

| 消费或反例 | 验收结果 |
| --- | --- |
| 仓库外只安装打包后的 model-contract，分别写调用者与 adapter | 类型可编译，必要纯函数可运行；完整生产依赖闭包无 Cordis、运行提供者、pi、tokenizer、词表和具体存储引擎 |
| 共同 Outcome 从 operation-result 根入口引用，清单声明生产依赖 | 使用共享唯一定义，完整生产安装闭包不含 Cordis；不能复制结构、内联品牌或漏列声明依赖 |
| 从 kernel-basis 根入口导入 Outcome | 编译失败，该根入口不导出操作结果；消费者须改用 operation-result |
| 根 import 或使用确定性契约函数 | 不读取环境、时钟或随机源，不创建任务、网络、登记状态或资源 |
| 纯契约消费者尝试调用 executeModel/createModelRuntime 或取得 ModelConfiguration | 不存在该导出；选择 model 实现后才可消费 |
| 独立程序安装 model 和选中的传输，调用 executeModel | 不安装 Cordis 或 model-host-local，不创建原工作；真实发送及清理沿原协议 |
| 只安装 model-cordis-contract 并导入 ./cordis | 只有框架及声明的契约闭包，不安装 model、host、厂商或引擎；定义自有登记表可独立验证 |
| model-host-local 装载实例/转换目录 | 使用定义包唯一具体类，通过同步核权、caller-fiber 登记、同 token 撤除及旧释放不删后继的共同用例 |
| 不同消费者解析到不兼容契约版本或重复 Service 身份 | 组合验收失败，不凭同名字符串或结构相似宣称兼容 |
| 迁移事件与文档 | 全部真实监听者采用 model-cordis-contract/call-changed；无旧名双发、无旧入口转导实现、无重复规格或品牌 |
| 同一契约配受控替代实现与实际实现 | 均执行契约符合性套件；故障、提交未知、首内容与 ACK 等协议不因不同构造器而改变 |

契约成员的 ./testing 可承载共同断言和确定性样本，不能创建默认宿主或导入具体提供者，测试运行器不进入生产依赖。本成员的 ./testing 已提供受控替代提供者与替代传输，六种失败路径（提交未知、无活体路由、陈旧实例、失权、重复 ACK、断流）在它们上有运行测试，覆盖表见[持续验证设施](#受控替代提供者)。脚本给出的结果不是生产证明。同一入口提供的提供者符合性断言已交付，替代件通过它的全部义务，覆盖见[符合性断言](#符合性断言)；它只证明公开面上可观察的义务，真实提供者上的运行另行验证。实现测试装配归 model/testing，单机与 Cordis 测试装配归 model-host-local/testing。其他领域生产代码只消费契约；需要真实组合验证的测试可显式选择实现作为开发依赖，并单独检查生产安装闭包。

领域外消费者的独立开发由角色夹具持续验证：五个角色（独立调用者、编排协调者、Context、结果消费者、通用提供者作者）各有一个夹具，从打包的制品安装，只依赖各自声明的包，运行命令 `pnpm --filter @omne-harness/model-contract run fixtures`。每个夹具至少一条正常路径和一条改变外部协调决策的失败路径，运行报告逐夹具列出路径名与结果。取消场景（请求、受理与实际停止分开，重复取消，无权取消，迟到结果与费用，不波及别的调用，不自动确认）归独立调用者夹具。覆盖的路径、设施的判定与未覆盖的部分见[角色夹具](#角色夹具)与[角色夹具的限度](#角色夹具的限度)；夹具里的替代件由脚本给出结果，通过不等于生产提供者满足契约。第六个角色 Cordis 消费插件不在本成员。

源码值边、生成声明、运行导入和安装闭包分别验证。包名与 exports 检查不能替代仓库外安装；移除 monorepo 路径别名和隐藏 hoist 后仍须通过。框架隔离不自动证明跨平台，实际支持范围须连同共享依赖的 engines 核验。

### 验证与待闭合输入


验证覆盖同范围并发建档、撤回与恢复身份、同名最具体筛选、锁名字且合法同名覆盖、缺凭据不退层、合法小窗口切换、动态配置扩大候选，以及未知来源不放行。

档案有效性验证包含缺值、非正、无限、低于已知上游、窗口小于输出上限、百分比越界、默认输出超过输出上限、输入模态缺 text、图片档案缺 image-bytes，以及更新时间倒退。计量验证由压缩方在请求前使用，包含恰好上限、单图通过但总量超限、估算无依据、遗漏工具声明和扩展后再计量。上游超限验证包含以 input-over-limit 收场、不重试、不回退。使用真实采用模型及证据检验适配，不用本地估算替代正式费用。

转换验证包含媒体类型优先、无件与不可用区分、错误派生、transcript 缺失、本地无模型调用、原件不变、失败不接纳，以及模型和工具真实结果仍保留。组合检查：Model 只接收投影，不统计、不保管、不重建；投影缺失或不可读时不放行。投影的增量维护与重建一致性由提供投影的域外信息源验证。列表开销按当前候选量及实际输出分别评价。

Tool 额外验证附件仅地址文本且不加载媒体、无附件的内容 ref、混合结果、可见性、发送前失权、摘要不符及读取超出容量。共享 ref 与消息校验尚未实现，MODEL-E01 继续跟踪迁移；任意嵌套语法不自动获准。

### 持续验证义务


| 反例或竞态 | 必须观察 |
| --- | --- |
| 结果完整但未处理也未保存 | 原结果可承接，不自动清理 |
| 原工作未结束但消费者已完成 | ACK 可生效，完成事实及必要处理结果可恢复，不强制消息化 |
| 先可靠保管内容与原位置，业务处理尚未完成 | ACK 可生效，后续处理从消费保存侧接续，不再依赖模型全文 |
| 消费侧保存成功后确认应答丢失 | 按原身份查确认，双方不丢责任、不重复处理 |
| 旧消费者或别租户 ACK | 拒绝，原结果不变 |
| 单发失败正等策略时 ACK | 拒绝，整调用继续 |
| 新领取与 ACK 同时发生 | 确认后禁止新领取，已有真实读不被截断 |
| ACK 之后用原读取 operation 重复 `beginRead` | 返回原 `beginRead` 的回答：未结束的读给首页，已结束的读给结束状态，不给新内容。只有新 operation 才返回 acknowledged。运行断言：`tests/testing-provider.spec.ts` 的「answers a repeated beginRead after the acknowledgement from the read it began, and a new operation with the acknowledgement」；该测试覆盖未结束的读、已结束的读与新 operation 三种情形，符合性断言 `acknowledged-result-not-read-again` 只覆盖新 operation |
| 真实写入未知后 ACK | 明确待核实及待清理，不伪释放 |
| 已确认后清理失败，消费者退出 | 模型负责续做，确认不回滚 |
| 共用数据另一调用仍在使用 | 不误删对方内容 |
| 费用未知但已可独立结算 | 无关全文可释放，未知及迟到结算可追溯 |
| 重复回执、确认、清理和重启 | 同一费用不重复，副本不复活、不重发 |
| 多个已处理调用持续产生 | 在契约前提下逐一可释放，无默认永久副本 |
| 原工作资格失效及消费者资格再变化后迟到结果（守卫路径，以资格参加者协议闭合为前提） | 真实事实保存，受到控制的调用不复活 |
| 远程遥测含秘密或私有附件地址 | 实际载荷被禁止或筛掉，缺口可识别 |
| 调用处在重试决定，消费者使原工作资格失效，控制协调者的逐调用控制尚未送达，随后消费者资格恢复，策略决定重试（守卫路径，以资格参加者协议闭合为前提；闭合前该 owner 只能免守卫，不提供这条保护） | 守卫对该调用仍答不合格（守卫端口，组合检查）。Model 在策略点或 S 读到不合格，记录由 Model 生成 operation 的控制，S 不发出，不追加真实发出 |
| 受理的 `ConsumerRef.owner` 未声明工作守卫参加者，也未声明免守卫 | 受理被拒绝，返回 invalid(field='consumer.owner')。认回已有受理不受影响 |
| 受理点 C 读守卫时，守卫或受信证据适配器不可用 | 返回 unavailable，`dependency` 为 `consumer-work-guard` 或 `consumer-evidence`，不形成调用，`diagnostic` 不带原工作信息。不当作不合格，不记录控制 |
| 发送点 S 提交时，守卫或证据适配器不可用 | 整次提交回滚。调用相位不变，dispatch 保持 prepared，不改成 not-sent，不记 ModelFault，不咨询重试策略，不消耗再试机会。driver 稍后重做同一次提交 |
| 调用方用主体以 `--` 开头的 `ModelOperationId` 调用任一接受调用方 operation 的方法 | 返回 invalid，字段取承载 operation 的字段（`operation` 或 `admission`）。例外：`cancel` 与 `ModelCommands.control` 在该值等于目标调用的派生值且派生控制已存在时，认回原控制。派生控制存在后，派生值用于其他方法仍返回 invalid，不返回 conflict |
| 装配声明里同一 `consumerOwner` 出现两次 | 提供者构造失败，不取后者或前者 |
| 调用受理后，装配删除该 owner、改为免守卫或换参加者版本 | 在途调用的 S 点、策略点与 ACK 读受理时冻结的声明与证据适配器，不受影响。冻结值要求的参加者或证据适配器缺席时按依赖不可用处理，不跳过守卫，不改按免守卫 |
| 装配声明里某 owner 的 `work.kind` 为 `guarded`，资格参加者协议尚未就绪 | 提供者构造失败，失败值指明该 owner 与协议未就绪。不降级为免守卫，不忽略 |

确切 ACK 提交、读写保护、清理任务和费用去重机制须提供可复跑并发与故障验证。验证区分过程通知、持久确认及账目事实；普通进程重启不能替代断电验证。受控替代提供者上，重复确认、确认与已开始读取的先后、取消的三态和迟到结果已有运行测试；它们按脚本给出结果，不证明真实提交、读写保护或清理。真实提供者上的并发与故障验证当前没有运行，本文规定其持续义务。

### 准备与装配的边界场景

| 场景 | 必须观察 |
| --- | --- |
| 同名租户档案缺凭据，官方档案可调用 | 返回租户胜出和缺失，不退层；合法列表仍可选 |
| 准备后输入或工具 schema 被修改 | 摘要失配，重新准备；不复用旧的固定请求 |
| 有未读取内容 ref | 计量结果为 deferred-media，prepare 零读取、零计量；物化阶段读取并编码，不计量 |
| 物化后编码的 payload 比请求前计量的更大 | Model 不检查大小，照常发送；上游拒绝时以 input-over-limit 收场，不重试，调用方压缩后以新调用重发 |
| 上游返回与超限响应相同的状态码，但供应商的超限信号不在 | 不形成 input-over-limit；状态码只是证据 |
| 同一档案身份的变更，其时刻早于上一次成功变更 | change 返回 unavailable（dependency 为 clock），原档案不变 |
| 档案变更使窗口小于输出上限 | change 返回 invalid 并列出字段，档案不变 |
| 准备租约的 `release` 钩子失败 | `release` 返回带 `failure`（kind 为 `unavailable`）的结果，不抛出；提供者仍欠这次释放，重复 `release` 返回同一结果。目前只有类型探针（`tests/profile-source.spec-d.ts`），没有运行时实现，也没有运行断言 |
| estimator 无 marginSource 或只计消息正文 | 计量能力返回具名失败，不填零余量或遗漏工具声明 |
| converter 已注册但提供者失去 | 明确 unavailable，不当作无件保留或换件重算 |
| converter 只返回同模态或文件派生 | invalid，原消息不接纳 |
| converter 换代后旧 release 晚到 | 新贡献仍在，已接纳 transcript 不变 |
| 输出已收到但 preserve 未确认时崩溃 | 未确认内容不展示，原 receive-window 不确定，不重发 |
| 目录、准备器或发送 adapter 退出 | 已受理调用仍可按持久权威查询/承接；相应局部能力明确不可用 |
| 接收的历史投影缺失或不可读 | 不当作空历史放行，不把缺口当纯文本；返回缺失或未知 |

这些场景在真实提供者上验证外部可观察结果。当前完成设计接受和声明类型检查；真实提供者上不是已运行的行为测试。受控替代提供者上的运行测试只覆盖外部协调者可见的失败路径，见[持续验证设施](#受控替代提供者)。


### 物化提交和来源场景

| 场景 | 必须观察 |
| --- | --- |
| 同输入同供应商，档案提供 4K 与 8K 上限 | meter 明确收到不同 context 与 limits，报告和拒绝结果可不同 |
| 同一档案 A/B 上游上限不同 | 分别保存采用和证据，不借 A 上限放行 B |
| 未传参数与显式传相同默认值 | origin 分别为 default 与 explicit，不伪造 requested |
| 物化成功，recordMaterialization 回执未知 | 保留原 operation，查明提交前 start 次数为零 |
| 物化已保存后取消、撤权或崩溃 | 不用 receipt 授发送权；恢复核原 dispatch 与实际内容 |
| 转换取消与成功竞争 | 恰好一个具名结果，取消不误走模型回复否决重试 |

### 分词、计量依据与供应商流

| 场景 | 必须观察 |
| --- | --- |
| 用户文本含特殊 token 的拼写 | 仍按普通文本计量；只有模板生成的显式特殊段使用控制 token |
| 普通文本切成相邻两段，编码具有跨边界合并 | 与合并后文本计数相同，不累加独立分段结果 |
| 未知控制 token、词表摘要不符或资源缺失 | 明确失败，不换编码、下载新版本或填字符倍率 |
| 相同 tokenizer，不同模板/投影/模型/媒体变换 | 旧报告不可直接复用，按实际组合重计 |
| 文本准确、模板或媒体估算 | 完整结果保持 estimate 和明确余量，不升级 exact |
| 校准 usage 范围不明、输出组不完整或前缀变化 | 回完整计量；完整计量也不可用则计量能力返回具名不可用 |
| 历史含不可解释的签名/加密表示 | 不按密文计数、不删除；没有明确支持契约则拒绝 |
| 空开块后再追加两个相同片段 | 开块不触发首内容；两个片段均计入，不按文本值去重 |
| 未开先填、模式错误、已封再填或不相容封口 | upstream-protocol；保留合法部分，不伪成功 |
| 工具参数被实际截断，包括剩余值仍是合法 JSON | 保留不完整标记，不生成可执行 ToolCallPart |
| 未开块的整交图片进入共享到达 | 原子映射 open/close，不把裸 close 交 assembler |
| 同批持久事实重放及两个相同文本片段 | 原 seq 重放认回；不同 seq 仍保留两个片段，冲突拒绝 |
| 内容 finish 后合法 usage 尾帧 | 在固定有界协议内收取，归原 dispatch，不新增费用身份 |
| ended 后迟到费用 | 经原迟到事实路径保存，不再交输出或翻转终局 |
| 旧 adapter 退休，reader 尚未结束 | 停止新取得，保留原资源；取消意图不等于可销毁 |
| 缓存命中后撤权或供应商改变 | 重新核当前资格，不凭命中发送 |

类型检查只覆盖操作形状与必要字段。以上计数、归约、校准和资源行为仍须由实际提供者的样本、故障与并发验证证明。

### 内部 module 与完整协作场景

| 场景 | 从 interface 可观察的结果 |
| --- | --- |
| 只装配档案求值，传输或转换器不存在 | list/resolve 可用；不要求启动 runtime 或供应商网络 |
| 切换小窗口后下一请求无法装入 | 调用方保存的选择保持；原用途失败且历史保留，不暗换模型 |
| 扩展修改消息或参数，随后需要重组装 | 原协调者记录扩展位置，组装方组装/压缩，Model 重校验；同次扩展只执行一次 |
| 含 Tool 内容 ref 的候选交回 | 明确 deferred-media；组装零媒体读取，物化读取超出容量则 start 为零 |
| 受理确认后调度通知丢失 | recover 从持久待办接续原 call，不能重复受理或丢工作 |
| 原执行者排除依据未知但目录为空 | 不 claim 第二执行者；查询保留未知，不当没有调用 |
| 非托管独立执行失败 | 原事实返回且资源释放，无自动重试、原工作、ACK 或隐式持久保管 |
| 托管独立消费者退出后恢复 | 原 admission/consumer 可认回；已 ACK 从消费侧继续，模型不重发 |
| quiesce 时仍有在途请求和清理待办 | 报告真实未完数量，原责任保留；退出不等于取消或清理完成 |
| 用户中断后工具参数恰好已完整 | 原未发出的工具建议不再执行；控制不顺带取消已独立发出的 Tool |
| 接收的投影与胜出档案声明的输入模态（`definition.input`）比对 | 档案不支持投影中的模态则不进入合法集合；投影缺失时返回未知（组合检查） |
| 组织管理员可看账目，但请求诊断全文 | 独立核诊断披露，无凭据或私有正文泄露；缺契约不默认放行 |
| 清理失败、迟到账目和旧实例晚撤并发 | ACK 不回滚，费用归原 dispatch，旧贡献不删新实例 |

上述场景是 implementation 的接受条件。当前只完成设计与结构检查，具体存储、传输、身份、内容读取及装配 adapter 仍须提供可复跑行为证据。

### pi 家族与 tokenizer 提供者组合

| 场景 | 必须观察 |
| --- | --- |
| 只安装一个家族及其依赖 | 根 Model 不携带其他家族资源；定义读取不初始化编码器或连接 |
| 两家族共用公共运输而请求规则不同 | 各按显式固定贡献解释；公共传输不按模型名前缀猜规则 |
| 同家族两个型号共享词表但配置/模板不同 | 各保留完整采用，缓存和计量结论不跨绑定误用 |
| 仅使用一个 tokenizer 引擎 | 不安装或加载另一引擎；count 不触发磁盘或网络下载 |
| 从打包产物在仓库外初始化 tokenizer | 资源可定位、许可证及摘要可核，不能依赖cwd或封存目录 |
| 模型家族不变而实际服务商改变 | 路由、完整计量、凭据和外传重新核验，不复用旧发送许可 |
| 官方目录有型号，但缺适用meter或路由证据 | 标明未具备对应发送支持，不能因目录存在宣称认证 |
| 物化后等待持久提交，或发送容量不足 | 已交付对象持有容量直到 start/close，不自行过期；不足在物化交付前失败，start 不再排队；远端连接失败沿现行发送结果语义处理 |
| 普通文本含编码器识别的控制符拼写 | 按普通文本计量，不采用all-specials模式 |
| 旧适配试图静默丢参数或携带未支持opaque历史 | 现行领域契约拒绝，不随技术栈继承旧例外 |

每个家族按精确 leaf/route 验证模型事实和供应商映射；共同传输测试与本地词元向量不能替代真实路由符合性证据。

### 提供者驱动与具体资源场景

| 反例或竞态 | 必须观察 |
| --- | --- |
| 重复 bind 同对象、不同对象及 bind 期间回调 | 同对象认回，不同对象 conflict；绑定完成前不 drive |
| 唤醒队列满、通知丢失及运行中再次唤醒 | 明确失败或保留唤醒位；持久扫描接续，同 call 不并行 drive |
| close 发生时 driver 仍持 reader | 不宣称关闭成功；原资源与保管责任保留 |
| 宿主心跳过期但旧进程仍能发送 | 不授新执行者；必须取得实际排除证据 |
| 绑定中一项词表初始化失败 | 整体失败，所有已取得租约归还 |
| family encode 尝试改变接收方或删工具 | 形状和固定输入检查拒绝；无实际发送 |
| SDK 默认重试、重定向或 start 内再次排队 | 符合性失败；不能隐去额外物理请求 |
| 已选 ref 很小但解码后资源超限 | 明确拒绝并清理，start 次数为零 |
| 处理期限到达但原生解码器仍运行 | 不释放仍在使用的缓冲区；保留退出和清理责任 |
| 未知模型的 usage scope | 保持未知，不从默认模板或家族名补值 |

这些是实现接受用例。设计声明编译只证明调用形状，不能证明线程、网络或资源的行为。

### 诊断披露与保留场景

| 反例或竞态 | 必须观察 |
| --- | --- |
| 仅有账目读取权、不同租户或撤权后的下一页 | 整次 denied，不泄露行、计数或存在性 |
| 失败 HTTP body、headers 或凭据出现在上游异常 | 边界归一化后仅保存白名单，普通诊断与遥测无秘密 |
| 两次查询之间新增尝试、修订事实或重启 | 原游标按原快照继续；新首屏才包含新事实 |
| 伪造游标、串 call 或快照过期 | invalid 或 denied，不自动切新快照 |
| 摘要到期但原输出仍未 ACK | 摘要可按采用清理，原结果继续保管；coverage 说明缺失前缀 |
| 诊断容量用尽且所有事实仍受保管保护 | 明确不可用，不能删除受保护事实或宣称完整诊断 |
| 重启使持续时间无法比较，或 send 回执未知 | 返回 unknown，不能填零或按最终成功倒推 |

诊断权限映射与保留数值的接受、真实存储的分页和清理行为仍须独立验证。

## Model 产品能力与设计覆盖

CAP-MD01 至 CAP-MD13 的接受状态与阶段承诺以[产品正文](../../../../.meta_harness/design/product/model-invocation/design.md#阶段与版本支持承诺)为准。本表连接[产品正文](../../../../.meta_harness/design/product/model-invocation/design.md)与已接受的非 pi-ai 技术设计，pi-ai 具体适配保持候选，不表示实际实现通过。所有行的运行验证均待实际提供者兑现。

| 能力 | 内部 module 与流程 | 对象与公开接口设计 | 行为/协议 | 必须验证的反例与剩余证据 |
| --- | --- | --- | --- | --- |
| CAP-MD01 档案维护 | 档案维护；[流程](../../model/docs/flows.md#flow-md01) | ProfileIdentity、ModelProfile、ModelProfileMaintenance | [条件变更](../SPEC.md#档案与请求准备协议) | 同名并发、撤回行重建、跨层维护、未知提交及断电；存储提供者未实现 |
| CAP-MD02 同名求值 | 档案求值；[流程](../../model/docs/flows.md#flow-md01) | ModelProfiles、ProfileResolution | [求值与列表](../SPEC.md#同名求值选择及列表) | 缺凭据不退层、撤回后合法外层、配置排除与未知；跨拥有者版本读取待实现 |
| CAP-MD03 会话选择 | 档案求值；选择的保存归调用方；[流程](../../model/docs/flows.md#flow-md01) | ModelChoices、ModalityRequirement；选择的保存归调用方 | [准备消费路径](../docs/context.md#先求值再组装和准备) | 小窗口允许切换、当前非法值保留、下一请求失败不撤销选择；调用方集成待验证 |
| CAP-MD04 租户凭据 | 凭据拥有者；发送；[流程](../../model/docs/flows.md#flow-md01) | 无秘密 ProfileSupplier、固定 Supplier 绑定引用 | [请求准备与发送](../SPEC.md#档案与请求准备协议) | 已有绑定不可读不退默认、解绑前后竞争；凭据引用与解析已在 model 实现；托管发送的当前资格与固定绑定适配尚未完成，新通道仍缺精确定义 |
| CAP-MD05 模态与转换 | 消息转换；接收的投影；[流程](../../model/docs/flows.md#flow-md02) | ModelMessageConversion、ModelConverterCatalog、ConvertedContent | [转换与投影](../SPEC.md#转换与历史投影协议) | 同键冲突、命中不可用、无 transcript、历史不回填、Tool ref 准入零读取；共享块迁移和历史原子接纳待验证 |
| CAP-MD06 完整请求合法性 | 请求准备；发送；[流程](../../model/docs/flows.md#flow-md02) | ModelRequestPreparation、ContextLimits、ModelLimit、RequestBudget、ModelInputMeter、ModelTextTokenizer、ModelCountingBasis | [准备协议](../SPEC.md#档案与请求准备协议)、[媒体加载](../SPEC.md#工具定义转换与内容引用加载) | 缺图片上限、窗口与输出上限矛盾、漏工具声明、AST 编码错误、估算缺余量、上游超限不重试、扩展后不重测；同编码器异模板、计量组合失效及特殊 token 注入；供应商 schema/计量实证待补 |
| CAP-MD07 真实发出与重试 | 调用推进；策略 seam；[流程](../../model/docs/flows.md#flow-md03) | DispatchRecord、RetryPosition、ModelRetryPolicy、ModelSendBoundary | [重试与恢复](../SPEC.md#342-重试失联与恢复) | 策略回执未知、首内容不确定、供应商切换及有限次数；真实传输与持久策略验证待做 |
| CAP-MD08 流式与原结局 | 输出交付；持久事实；[流程](../../model/docs/flows.md#flow-md03) | VisibleBlock、Snapshot、TransportFact、Settlement | [流式规则](../SPEC.md#流式和首内容)、[展示顺序](../SPEC.md#展示诊断与实施证据) | 块模式途中变化、未封口工具参数、保存前展示、崩溃后重发；append/replace 混用与用量尾帧；分段存储与供应商协议需验证 |
| CAP-MD09 控制与恢复 | 调用推进；恢复宿主；[流程](../../model/docs/flows.md#flow-md08) | ControlState、ExecutionRef、ModelInstanceHost、ModelDriver、ModelHostAuthority、RecoveryRecord | [取消与恢复](../docs/context.md#竞争与恢复场景) | 观察者退出、查询失败冒充失联、旧执行者未排除、原工作资格失效后迟到（守卫路径以资格参加者协议闭合为前提）；宿主排除和实际控制待验证 |
| CAP-MD10 消费与清理 | 结果消费与回收；[流程](../../model/docs/flows.md#flow-md05) | ModelConsumption、Handoff、ReadId、CustodyState | [ACK](../SPEC.md#ack-的前提与效果)、[清理](../SPEC.md#清理范围与读写保护) | 提前 ACK、保管引用失效、未知写、新读竞争、清理失败恢复；真实耐久和共享内容释放待验证 |
| CAP-MD11 真实费用 | 原 dispatch 事实；账目投影；[流程](../../model/docs/flows.md#flow-md06) | DispatchRecord、LateDispatchFact、共享 CallAccount | [费用事实](../SPEC.md#真实费用和账目边界) | 多 observer 重复入账、两次真实费被合并、未知填零、迟到复活原工作；校准统计口径不明不得借用；账目查询由其拥有者实现 |
| CAP-MD12 数据保护 | 各操作守卫；发送与披露；[流程](../../model/docs/flows.md#flow-md06) | Access、来源证据、发送围栏、ModelMediaReader | [保护](../SPEC.md#数据保护与异常)、[准备协议](../SPEC.md#档案与请求准备协议) | 跨租户、接收方改变、伪 source、撤权后发出、秘密入错误；ModelDiagnostics 最小字段与保留机制已接受，权限/具体数值仍待采用 |
| CAP-MD13 性能与观测 | 接收的模态投影；阶段观测；[流程](../../model/docs/flows.md#flow-md09) | 模态覆盖依据、ModelDiagnostics、阶段观测、游标与有限缓冲 | [投影](../SPEC.md#转换与历史投影协议)、[观测](../SPEC.md#展示诊断与实施证据) | 投影缺失当空历史、混同 TTFT、缓冲无界；固定资源在途排空、缓存不能绕权；真实性能量测和诊断入口待实现 |
| 消费者工作守卫与 owner 声明（跨 CAP-MD09、CAP-MD12） | 调用推进；发送；持久事实；[流程](../../model/docs/flows.md#flow-md04)、[策略点](../../model/docs/flows.md#flow-md03) | ConsumerRef、CallState.control、ModelConsumerOwnerDeclaration（[装配声明](../docs/public-api.md#消费者-owner-的装配声明)）；守卫问答事实的形状待资格参加者协议 | [资格、共同提交与实际发送](../SPEC.md#342-资格共同提交与实际发送) | 重试决定中的调用原工作资格失效，资格随后恢复，策略决定重试：守卫仍答不合格，S 不发出；未声明守卫或免守卫的 owner 受理被拒绝，返回 invalid(field='consumer.owner')。见[持续验证义务](#持续验证义务)。另须验证：同 owner 重复声明、装配变更后的在途调用读冻结声明、保留 operation 前缀被拒收、守卫与证据适配器不可用，以及受守卫 owner 在资格参加者协议未就绪时构造失败（见 [SPEC 资格](../SPEC.md#342-资格共同提交与实际发送)）。守卫问答事实的形状待资格参加者协议闭合，闭合前只受理免守卫 owner，需要单调失格的组合不能上线该路径。守卫不可逆须经组合验证 |

内部 module 的 interface、状态及依赖分类见[架构](../../model/docs/architecture.md#内部-module-与-interface)。上表覆盖全部 13 项产品能力，另有一行跨能力的消费者工作守卫与 owner 声明；主路径以外，[两种独立调用](../../model/docs/flows.md#flow-md07)适用于 CAP-MD06..12，[宿主恢复](../../model/docs/flows.md#flow-md08)串联执行、保管及账目。一个能力在表中有位置不代表行为测试已通过。

### 设计验收与实现验收

设计评审核对责任、数据形状、顺序、失败、恢复和可消费性。接口可编译只证明声明能连接。Model 领域契约与 Cordis 定义设计已接受；具体提供者、共享块实现和实际供应商仍须在各自拥有者处完成实现验收，pi-ai 设计另待接受。

新凭据通道、具体供应商支持子集、诊断权限映射和保留数值尚未定案。当前为这些约束保留明确接口责任，不把缺口当阶段豁免。依赖上述内容的具体实现应先补齐精确输入；其他明确能力可按已接受范围推进。

持续场景见 [scenarios](#model-持续验证场景)，类型验证见 [type-consumption](#model-类型消费检查)，Cordis 撤除场景见 [装配](../../model/docs/cordis.md#接入检查)。

### 完整设计的实现输入

| 横向责任 | 唯一设计入口 | 后续接受证据 |
| --- | --- | --- |
| 档案/准备/转换的依赖及构造 | [构造](../../model/docs/public-api.md#独立能力构造)、[资源端口](../docs/public-api.md#档案来源与准备资源) | 替代来源、部分取得失败及独立装配 |
| 持久协调与流保管 | [记录与提交](../../model/docs/architecture.md#持久提供者的记录与提交)、[调用对象](../../model/docs/architecture.md#调用执行对象与所有权) | 未知提交、保存后展示、读取/ACK/清理竞争和断电 |
| 宿主驱动与恢复 | [受信驱动](../docs/public-api.md#受信宿主驱动)、[单机插件](../../model/docs/cordis.md#单机提供者的插件划分) | 绑定、持久唤醒、真正旧执行排除及关闭失败 |
| pi、家族和引擎 | [贡献协议](../../docs/architecture.md#pi-家族贡献的取得协议)、[证据矩阵](../../docs/architecture.md#官方支持与计量证据矩阵) | 固定资源、真实 route、未知 usage、无隐式重试及完整计量 |
| 多模态资源 | [物化](../../docs/architecture.md#物化和引擎资源控制) | 仅选定 ref 被读取，恶意媒体限额及取消后的真实退出 |
| 诊断与前置 | [诊断协议](../SPEC.md#诊断查询与保留)、[拥有者](../../model/docs/architecture.md#诊断投影与跨领域前置) | 越权、分页快照、期限与保管独立、安装闭包 |

非 pi-ai 设计已接受，可以据此分配实现责任；pi-ai 相关细化仍为候选。设计接受不代替共同依赖采用和实际提供者证据。每个实现切片沿相应反例验收，不以本节的存在关闭能力交付。

## Model 类型消费检查

类型消费检查按三个模块分别消费，不维护一份手工缩减的替代接口。本成员与 Cordis 定义的声明在各自的 `src/` 里，[本成员的 public-api](../docs/public-api.md) 与 [Cordis 定义的 public-api](../../model-cordis-contract/docs/public-api.md) 只导航到它们，探针直接从包入口导入。[model 实现入口](../../model/docs/public-api.md)尚未实现，它的设计声明仍在该页的代码块里。检查使用仓库实际 operation-result、legal-identity、content-block、message、json-text 和 call-account 根类型，开启 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 及 noEmit。

上述是声明的形状检查，不证明纯契约可独立安装。真实分包后从实际产物分别消费 model-contract、model-cordis-contract/cordis、model 和 model-host-local/cordis，沿[目标导出归属](../docs/public-api.md#导出归属与落地前置)核对工厂及构造类型。共同 `Outcome` 必须从 `@omne-harness/operation-result` 导入，并由生产依赖声明承接。该共享成员零依赖不代替 Model 完整安装闭包的验证。

新增负例须证明纯契约不能导入 executeModel/createModelRuntime 或 ModelConfiguration，Cordis 消费者不从具体插件取得 Service 定义；生成声明不得穿透实现源码。正例覆盖 adapter 只消费纯契约即可实现相应端口，以及消费者和实现共享同一品牌/Service 身份。其他实现不必采用 model 工厂的配置结构。

正例检查独立函数不需要原工作、托管受理/原查询/目录/读取/processed ACK 可以连接、提供者具有恢复入口。负例检查缺少租户、混用 instance 与 call、使用未验证操作字符串、普通消费者发布实例、裸 saved 布尔代替交接证据、伪造独立函数的托管身份参数和调用者越权访问 quiesce 均不能通过类型检查。对 `ModelCalls.cancel` 与 `ModelCommands.control` 传入 `reason` 字段，被多余属性检查拒绝，因为取消输入不携带原因。

这些正例使用声明的消费者持久完成函数，不实现它，不能据此声称其 DurableEvidence 为真。类型检查也不能证明不同 operation 的字符串不同、主体当前有权或附件已耐久；这些是运行边界与协议的验证责任。探针脚本与原始输出归任务 tmp，不是公开导出。

准备接口的正例包含求值、完整组装、prepare 和原 admit。负例覆盖估算缺余量、deferred-media 空引用、修订缺 expected、变更夹带更新时间、档案缺 updatedAt 或 context、token 维度写成 LimitMetric、档案供应商夹带秘密、转换成功缺 transcript。编译文件清单不得出现 packages/tool；运行资格和摘要真实性仍由实际边界验证；输入是否超限以上游响应为准。固定请求不带 budget、meter、limits，探针以多余字段为负例。

物化消费正例连接 PreparedTransport.materialize 的回执与 ModelCommands.recordMaterialization。负例覆盖计量缺 context 或 limits、物化对象缺 receipt、回执夹带 budget、default 参数伪造 requested、input-over-limit 缺 reported。转换取消以具名 failure 返回，不依赖未声明的异常。

计量补充正例消费 count 的结果和失败、meter.basis、完整报告中的 counting，并分别构造块操作及累计快照。负例覆盖 tokenizer 不提供 encode、特殊段缺 name、预算缺 counting、以旧 output 形式交流事实，以及把完整快照塞入 delta。精确计数、统计口径与事件时序不由这些类型探针证明。

宿主与独立能力的正例连接 createModelProfiles、createModelRequestPreparation、createModelMessageConversion、createModelRuntime 和 host.bind(provider.driver)。ModelBindingFailure.conflict 必须不借业务 operation/revision 即可表达。负例覆盖普通 runtime 取得 driver、驱动缺 continuity、工厂缺注入依赖、转换缺来源核验依赖以及注册缺 authority。

pi 提供者候选另从[组设计](../../docs/architecture.md#pi-家族贡献的取得协议)提取目标贡献声明，验证固定供应商取得、物化表示、每次 decoder 与 finally 释放能连接。它不是领域契约的导出，也不是该目标包已经存在的证据。

诊断消费覆盖原 call 的授权输入、品牌游标及最小字段。漏租户/调用、普通字符串游标和把原请求 body 写入白名单记录须被拒绝。结构类型只约束公开声明，不防止不可信对象多带字段；运行边界须构造白名单投影并执行权限及内容校验。

身份与序列的正例使用根入口的品牌类型：每个品牌是 `Identity` 的一个键，`ModelIdentityKey` 列出十一个品牌键（含无前缀的 `ModelCredentialId`），`ModelIdentityRejection<K>` 的 `field` 取品牌键，`reason` 是闭合的六个值。负例覆盖：普通字符串不能赋给任何品牌，一个品牌不能赋给另一个品牌，`Revision` 不能放到 `OutputCursor` 位置，导出类型名（例如 `'DispatchId'`）不是品牌键，不在列表内的 `reason` 与 `field` 被拒绝。这些是类型探针，能在声明阶段运行。

解码与比较函数的正例与负例在 `tests/root.spec-d.ts`：`decode*` 的成功值可放入 `Access`、`CallAccess` 与 `Mutation`，失败值的 `field` 与函数的品牌键一致，`compareRevisions` 与 `compareOutputCursors` 接受同类品牌。负例覆盖：向 `decodeModelCallId` 的成功值位置传 `DispatchId`，把 `OutputCursor` 传给 `compareRevisions`，把 `Revision` 传给 `compareOutputCursors`，没有 `compareResultVersions`（探针），也没有编码函数与相等函数（`tests/public-entry.spec.ts` 的运行时键集合）。运行行为由 `tests/identity.spec.ts` 覆盖，不由类型探针证明：每个品牌至少一个成功例与每个适用 `reason` 一例，比较覆盖相等、长度不同、等长不同文本，以及 `"10"` 对 `"9"`（防止按字典序误比），`ModelOperationId` 的主体以 `--` 开头时仍能解码。

消费者 owner 装配声明的正例：免守卫声明带 `evidence` 通过类型检查；`work.kind = 'guarded'` 的声明带 `participant`；`deriveGuardControlOperation` 的返回值作为 `ModelOperationId` 传给 `ModelCalls.cancel`（`tests/consumer-owner.spec-d.ts`）。负例：缺 `evidence`（免守卫也必须给出）、`work.kind` 拼写错误、`consumerOwner` 写成 `owner`、受守卫声明缺 `participant`，均被类型检查拒绝。`participant` 在资格参加者协议闭合前是暂定形状，协议改变它时，这些用例同步改。类型检查不证明同一 owner 不重复声明、受守卫 owner 构造失败或冻结行为，这些归提供者构造与组合验证。

凭据契约的正例使用根入口的凭据名字：`Supplier.credential.id` 是 `CredentialId`；`CredentialReference` 与 `CredentialQuery` 可传给 `sameCredentialHolder`，两者都只取 `id` 与 `tenant`；一个只含 `present` 与 `resolve` 的对象是 `CredentialPort`，保管方可在其上自行扩展诊断；`decodeCredentialId` 的成功值可作为引用的 `id`，失败值的 `field` 是 `'ModelCredentialId'`。负例覆盖：普通字符串和 `ModelCallId` 不能当 `CredentialId`，引用的用途只能是 `model-send`，引用缺租户，`resolve` 结果缺 `scope` 或在 `absent` 上带 `value`，把 `diagnostics` 放进 `CredentialPort` 的对象字面量被多余属性检查拒绝，`Supplier.credential.id` 不接受普通字符串。运行行为由 `tests/credential.spec.ts` 覆盖：成功例、`type`、`empty`、`length`（含按 UTF-16 码元计数）、`character`（含制表符、零宽空格、双向控制字符、孤立代理码元，成对的代理码元被接受），非 ASCII 字母被接受，`sameCredentialHolder` 对未经 legal-identity 铸造的租户返回 `false`。类型探针不证明端口实现的五种结果取舍，那由保管实现的测试负责。

引用共享 `ToolCallPart` 的声明有如下探针。`tests/result.spec-d.ts`：`ToolSuggestion` 与 `ToolCallPart` 类型相同；`ModelBlock` 接受内容块和完整调用，拒绝参数未收齐的调用（`IncompleteToolCallPart`）、参数无法解码的调用（`UnparsedToolCallPart`）与结果标记（`ToolResultPart`）。`tests/call-surface.spec-d.ts`：`VisibleBlock` 的已封块不接受未收齐的调用，增长值只取四种增长内容；`Snapshot.blocks` 与 `ResultPage.blocks` 不能赋给可变数组；`Observation` 与 `ReadState` 的结束原因是闭合集合；`ReadStart.acknowledged` 只接受已交接的保管状态；`ModelHandle.observe` 要求租户与取消信号，`LiveRoute` 的无路由形态不带 handle，普通 `ModelRuntime` 没有 driver，其目录没有发布入口。`tests/provider.spec-d.ts`：`TransportFact` 的封口块与结束事实、`IndependentModelFact` 的两种未开始、传输链从 prepare 到事实流、`ModelCommands` 的写入带代次与期望修订、`recordSend` 不接受 prepared、`claim` 需要连续性证据、`ModelInstanceHost` 与 `ModelProvider` 的入口形状。`tests/driver.spec-d.ts`：`ModelDriverHost` 是带 `bind` 的实例宿主，普通实例宿主没有 `bind`。这些探针是类型检查，不证明供应商流事实能被还原为完整的 `ToolCallPart`，该归约归供应商解释与流状态的运行验证。

模态词表来自共享成员 `@omne-harness/modality`。`tests/profile.spec-d.ts`：`ModelModality` 是 `Modality` 的子集且恰为 `text`、`image`、`voice`，档案定义的输入或输出带 `video` 报错；`ModalityRequirement.modalities` 的成员恰为 `Modality`，可带 `video`，不认识的名字报错。`tests/conversion.spec-d.ts`：`ConverterKey` 的模态键与 `acquire` 输入的 `modality` 接受 `video`，后者还接受 `null`。
