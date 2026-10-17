# Model Cordis 验证责任

验证唯一 Service 身份、登记与条件撤除、caller-fiber 归属、通知及安装闭包。[场景](scenarios.md)是交付义务，当前模板入口测试不证明这些行为。共同领域验证由 [model-contract](../../model-contract/verification/index.md)维护。

## 持续验证设施

设施放在 `tests/`。验证说明放在本页，因为模板的 `verification/` 只接受 README、index、models 和 proofs。设施只证明下表"能发现"一列。它们不证明登记、撤除或租约行为，那些归真实 Cordis 测试。

| 设施           | 位置与命令                                                                                                                                             | 能发现                                                                                                                                                                                                                                                          | 发现不了                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 导出清单比对   | `tests/fixtures/exports.json`、`tests/exports-inventory.ts`、`tests/exports.spec.ts`。运行 `pnpm --filter @omne-harness/model-cordis-contract test`    | 两个入口漏导出、多导出、值与类型种类错误、清单标 `pending` 但产物已有、纯类型在两个入口不是同一声明、`sameAs` 指向的入口没有列出该名字或种类不同、模块增补与清单不符、清单与 `docs/public-api.md` 的章节或导出名不一致、`pending` 总数与 `expectedPending` 不符 | 声明的形状与行为                                           |
| 安装闭包       | `tests/install/`、`tests/fixtures/install-policy.json`。运行 `pnpm --filter @omne-harness/model-cordis-contract run install-closure --out <报告.json>` | 框架契约闭包里的默认 Model 与供应商实现、pi、厂商 SDK、分词引擎、存储引擎，协议残留，入口解析（含 CommonJS `require`）或类型解析离开消费目录，离线安装失败（除非明示允许联网），消费目录越界或删除无标记的目录                                                  | 类型面以外的语义；Service 类单一身份（归真实 Cordis 测试） |
| 夹具运行器骨架 | `tests/fixture-runner.ts`、`tests/fixture-runner.spec.ts`                                                                                              | 夹具没有声明正常路径或失败路径，失败路径没有写明改变的协调决策，必需角色缺夹具                                                                                                                                                                                  | 夹具本身是否证明了行为。现在还没有夹具                     |

### 导出清单

清单读取构建产物 `dist/*.d.ts`，不读源码文本。比对使用 `@typescript/typescript6` 的编译器 API，它解析 `export *` 与再导出，并按符号标志区分类型、值和类。`make declarations-check` 不能复用。它只对全部成员的 `dist` 声明报告诊断，不枚举导出。

清单按入口分列，来源是 [public-api](../docs/public-api.md) 的代码块。测试另解析该页，要求清单的章节与导出名同含 ```ts 代码块的章节与这些代码块导出的名字一致。根入口再导出的名字在两个入口里各列一次，按章节合并比较。

| 入口       | 内容                                           | 项数 |
| ---------- | ---------------------------------------------- | ---- |
| `.`        | 8 个纯类型（D-1）                              | 8    |
| `./cordis` | 16 个 Service 类、16 个键、再导出的 8 个纯类型 | 40   |

`./cordis` 里的纯类型标 `sameAs: "."`。测试检查它们解析到根入口的同一声明，并且只读清单检查：带 `sameAs: X` 的每个名字，入口 X 的清单里必须也有它且种类相同。按章节名合并比较页面时，根入口整章被删而 `./cordis` 仍列着这些名字，页面对照发现不了，这条清单检查补上这一点。

`declare module '@deepseek-ai/cordis'` 的 `Context`（16 个成员）和 `Events`（1 个事件 `model-cordis-contract/call-changed`）是模块增补，不是导出。它们在清单的 `augmentations` 里单列，测试从 `dist/cordis.d.ts` 里读出成员比对。事件载荷与 JSDoc 标签由后续的类型测试检查，这里只核对成员名。

每项有 `pending` 标记。`pending: true` 表示声明已接受但产物还没有。比对规则如下：

1. `pending: false` 的名字必须在产物里出现，种类相符。
2. `pending: true` 的名字必须不在产物里。已经出现就失败，提醒改标记。
3. 产物里清单没有的导出算多导出。
4. 测试输出每个入口的"已列出、待落地、已落地"计数，并要求两个入口的 `pending` 总数等于清单顶层字段 `expectedPending`（现为 48：根入口 8 项，`./cordis` 40 项）。落地名字的阶段在同一次改动里降低该值。

### 安装闭包

流程、报告和退出码与 [model-contract 的说明](../../model-contract/verification/README.md#安装闭包)相同，两个成员各有一份字节相同的 `tests/install/`（D-2）。本成员的差别如下：

- 策略是框架契约：允许 `@deepseek-ai/cordis`，禁止默认 Model（`@omne-harness/model`、`@omne-harness/model-host-local`）和供应商实现。
- 探针导入两个入口：根入口与 `./cordis`。`./cordis` 在运行时导入 `@deepseek-ai/cordis`，该包与它的传递依赖从工作区锁定的精确版本安装进消费目录。
- 慢层测试 `tests/install-consumer.spec.ts` 另有一个传递依赖负例：策略禁止 `@deepseek-ai/cosmokit`（Cordis 自己的依赖）。声明闭包里看不到它，设施必须在安装后的列表里找到并失败。

- 安装步骤只用 `--offline`。失败时整次运行失败。只有明示 `--allow-network`（或 `OMNE_INSTALL_ALLOW_NETWORK=1`）才会再用 `--prefer-offline` 重试。报告字段 `install.mode`（`offline` 或 `network`）与 `install.allowNetwork` 记录这一点。
- 解析钩子是同步的 `module.registerHooks`，记录 ESM `import` 与 CommonJS `require`，`registerHooks` 不触发 DEP0205。
- `--work-dir` 必须在成员的 `tmp/` 或仓库的 `tmp/install-closure/` 之下，不得是符号链接，非空时须带标记文件 `.install-closure-consumer`；否则退出码 2，不删除内容。

负例都在慢层（起子进程）：

- `tests/install-closure.spec.ts` 在清单的临时副本里注入默认 Model、本地宿主、pi、厂商 SDK、分词引擎、存储引擎各一个，断言退出码为 1、报告点名被注入的包、没有打包。同一文件另证：`--work-dir` 护栏（成员目录、允许范围之外的目录、无标记的非空目录）退出码为 2 且内容保留，这几条都对测试自己在临时目录里造的成员运行，不指向任何仓库路径；空 pnpm 存储使 `--offline` 失败时退出码为 1、`install.mode` 为 `offline`。
- `tests/install-probe.spec.ts` 在手工搭的消费目录里证明祖先 `node_modules` 的 CJS、ESM 与类型依赖、解析到 `src/` 都使对应检查失败。
- `tests/install-consumer.spec.ts` 对未修改成员做真实打包与安装，断言报告的检查项 id 与预期的完整集合相等、`typeCheck.files` 大于 0、探针入口列表等于两个入口，并在 `afterAll` 里删除它创建的 `tmp/install-closure/` 目录。预期集合里每个被打包的闭包成员各有 `pack`、`tarball-no-source`、`tarball-no-workspace-protocol` 三项，成员列表写在测试里，现为 9 个：本成员、`legal-identity`、`model-contract`、`operation-result`，以及 `model-contract` 闭包里的 `call-account`、`content-block`、`json-text`、`message`、`utc-instant`。生产依赖变化时这个列表同步改。model-contract 的同名测试用同一方法，但该成员只有一个入口、没有传递依赖负例，所以两份 `install-consumer.spec.ts` 不相同。

纯判断（`inside`、制品源码、锁文件残留、空类型文件列表、护栏、联网回退决策、必需检查项清单）在快层的 `tests/install-judgment.spec.ts`。`finish()` 在所有检查通过但缺少必需检查项时使报告 `ok` 为 false，所以漏接一个判断会使对真实成员的正例变红。

### 未覆盖

- 真实 Cordis 4.0.4 驱动的登记、撤除、租约、退休与排空测试（S-2）由后续阶段写。
- 类型消费检查、Cordis 消费插件夹具和 Service 类单一身份检查由后续阶段写。
- 离线安装依赖本机 pnpm 存储里已有的精确版本，缺失时运行失败，设施不自行联网；`--allow-network` 路径只由替身运行器的单元测试覆盖。
- 检查项是否接进报告由对真实成员的正例核对。判断函数收到的输入是否真实不在其内，说明见 [model-contract 的未覆盖](../../model-contract/verification/README.md#未覆盖)末条。
- 类型断言检查放在 model-contract。本成员的 Service 实现可能合法地使用断言，所以不套用同一规则。
- 页面与源码的类型一致检查（model-contract 的 `tests/public-api-types.spec.ts`）只对 model-contract。本成员的声明还都是 `pending`，源码里没有。落地后，Service 类、键、模块增补与根入口纯类型的形状仍没有这类检查；`sameAs` 检查只证明 `./cordis` 与根入口是同一声明。
