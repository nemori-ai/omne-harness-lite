# Model 持续验证资源

本目录维护契约场景、类型消费检查和模型验证的持续义务。行为唯一正文归 [SPEC](../SPEC.md)，本目录不授予设计接受，也不表示行为测试已经通过。

产品定义的 CAP-MD01 至 CAP-MD13 全部纳入 `0.0.0 → 0.1.0` 完整交付，范围归[产品阶段承诺](../../../../.meta_harness/design/product/model-invocation/design.md#阶段与版本支持承诺)。技术缺项和未运行的验证不降低该范围。

当前只有验证要求与前提说明，没有本目录可执行的协议模型或证明。具体运行、临时探针和逐轮评审证据归任务 tmp。后续资源须记录真实依赖、性质、命令、覆盖及限制，不能用静态类型或模型枚举替代提供者故障验证。

目录导航见 [index](index.md)。独立验收归 [acceptance](../../model/acceptance/index.md)。

产品与设计逐项对应见[能力覆盖](coverage.md)。

## 持续验证设施

设施放在 `tests/`。验证说明放在本页，因为模板的 `verification/` 只接受 README、index、models 和 proofs。设施只证明下表"能发现"一列。它们不证明行为已实现。

| 设施 | 位置与命令 | 能发现 | 发现不了 |
| --- | --- | --- | --- |
| 导出清单比对 | `tests/fixtures/exports.json`、`tests/exports-inventory.ts`、`tests/exports.spec.ts`。运行 `pnpm --filter @omne-harness/model-contract test` | 漏导出、多导出、值与类型种类错误、清单标 `pending` 但产物已有、`package.json` 增加入口而清单没有、清单与 `docs/public-api.md` 的章节或导出名不一致、`pending` 总数与 `expectedPending` 不符 | 声明的形状与行为 |
| 安装闭包 | `tests/install/`、`tests/fixtures/install-policy.json`。运行 `pnpm --filter @omne-harness/model-contract run install-closure --out <报告.json>` | 生产依赖闭包里的禁止包、`workspace:` 等协议残留、制品带源码、入口解析（含 CommonJS `require`）或类型解析离开消费目录、声明在独立目录不能编译、离线安装失败（除非明示允许联网）、消费目录越界或删除无标记的目录 | 类型面以外的语义；制品在生产环境的运行 |
| 类型断言检查 | `tests/type-assertions.ts`、`tests/type-assertions.spec.ts` | `src/`、`src/testing` 与 `tests/fixtures/` 里用类型断言铸造品牌值（AC-G1-6） | 其他位置的断言；断言之外的越权构造 |
| 夹具运行器骨架 | `tests/fixture-runner.ts`、`tests/fixture-runner.spec.ts` | 夹具没有声明正常路径或失败路径，失败路径没有写明改变的协调决策，必需角色缺夹具 | 夹具本身是否证明了行为。现在还没有夹具 |

### 导出清单

清单读取构建产物 `dist/*.d.ts`，不读源码文本。比对使用 `@typescript/typescript6` 的编译器 API。它解析 `export *`，所以 `index.d.ts` 只写 `export * from` 也能列出名字，并按符号标志区分类型与值。

`make declarations-check` 不能复用。它只把全部成员的 `dist` 声明交给 TypeScript 6 建程序，报告诊断，不枚举导出。

清单按 [public-api](../docs/public-api.md) 的章节分组，来源是该页的代码块，共 153 项：139 个类型和 14 个值。每章数量如下。

| 章节 | 项数 | 类型 | 值 |
| --- | --- | --- | --- |
| 根入口的值与请求 | 35 | 23 | 12 |
| 结果、失败和状态 | 16 | 16 | 0 |
| 普通调用面与实例观察 | 14 | 14 | 0 |
| 独立执行与提供者操作 | 30 | 30 | 0 |
| 档案与请求准备 | 24 | 24 | 0 |
| 消息转换 | 9 | 9 | 0 |
| 文本分词与完整计量依据 | 5 | 5 | 0 |
| 受信宿主驱动 | 6 | 6 | 0 |
| 档案来源与准备资源 | 6 | 6 | 0 |
| 供应商尝试诊断 | 8 | 6 | 2 |

public-api 有 17 个二级章节，其中 10 章含声明代码块。其余 7 章只指向 SPEC，没有声明，清单不为它们造项。测试要求每个出现在清单中的章节非空，并解析 `docs/public-api.md`，要求清单的章节与导出名同该页含 ```ts 代码块的章节与这些代码块导出的名字完全一致。来源为 `R-3` 的名字在写回 public-api 之前是允许的多余项。

R-3 已采用的 14 个运行时名字（10 个解码函数、2 个比较函数、2 个常量）和 2 个类型还没有写回 public-api。清单直接取自 R-3 §4，项上标 `origin: "R-3"`，写回后来源改为 public-api。两个诊断解码函数归入"供应商尝试诊断"，其余归入"根入口的值与请求"。

每项有 `pending` 标记。`pending: true` 表示声明已接受但产物还没有。比对规则如下：

1. `pending: false` 的名字必须在产物里出现，种类相符。
2. `pending: true` 的名字必须不在产物里。已经出现就失败，提醒改标记。
3. 产物里清单没有的导出算多导出。
4. 测试输出每个入口的"已列出、待落地、已落地"计数，并要求 `pending` 总数等于清单顶层字段 `expectedPending`（现为 153）。落地名字的阶段在同一次改动里降低该值，删除名字或改回 `pending` 而不改它会失败。

`./testing` 入口随 R-5 增加。增加时同时在清单里加这个入口，否则"清单覆盖全部 `exports` 子路径"的测试失败。

### 安装闭包

流程如下：

1. 从 `package.json` 读出生产依赖闭包（`dependencies`、`optionalDependencies`、`peerDependencies`），沿工作区成员递归，不用 pnpm，不联网。
2. 用 `tests/fixtures/install-policy.json` 检查禁止清单。命中就在打包之前失败，报告点名包、类别和依赖链。
3. 用 `pnpm pack` 打包闭包内每个工作区成员，检查制品：没有 `src/`、`tsconfig*`、非声明的 `.ts`，生产依赖里没有 `workspace:`、`catalog:`、`link:`、`file:`。
4. 在 `tmp/install-closure/<成员名>/project/` 写独立消费工程，只依赖本成员制品。其他闭包成员和第三方包用 `pnpm.overrides` 钉到制品路径和工作区锁定的精确版本。用 `pnpm install --ignore-workspace --ignore-scripts --offline` 安装。`--offline` 失败时整次运行失败，`install` 检查为不通过。只有调用者明示 `--allow-network`（或环境变量 `OMNE_INSTALL_ALLOW_NETWORK=1`）时，才会再用 `--prefer-offline` 重试，该次可能访问 registry。报告字段 `install.mode` 是 `offline` 或 `network`，`install.allowNetwork` 记录是否允许。
5. 安装后再列出实际安装的全部包，重新检查禁止清单，覆盖只有安装后才可见的传递依赖。
6. 在消费目录里用 Node 的同步解析钩子（`module.registerHooks`）记录每一次模块解析，ESM `import` 与 CommonJS `require` 都在内，逐个导入 `exports` 里带 `import` 条件的入口。每个解析结果的真实路径必须在消费目录内，不得落在 `src/` 或 `.ts` 文件。
7. 用 TypeScript 6 编译一个只导入全部入口类型的文件，`types` 与 `typeRoots` 为空，`skipLibCheck` 关闭。`--listFiles` 列出的文件必须在消费目录内，或属于编译器自带库。

报告是 JSON：`closure`（声明闭包）、`install`、`installed`、`forbidden`、`tarballs`、`probe`、`typeCheck`、`checks` 和 `ok`。退出码：0 全部通过，1 有检查失败，2 用法或工具错误。设施拒绝在设置了 `NODE_PATH` 的环境里运行。运行入口 `pnpm run` 不设置 `NODE_PATH`，但经 `pnpm exec` 启动的 vitest 会设置，所以测试给子进程去掉它。

`--work-dir` 受护栏约束：目录必须在成员的 `tmp/` 或仓库的 `tmp/install-closure/` 之下，不得是符号链接；目录已存在且非空时，必须带设施写入的标记文件 `.install-closure-consumer`。不满足时拒绝运行，退出码 2，不删除任何内容。`--store-dir` 指定另一个 pnpm 存储。

实测结论：

- `pnpm pack` 接受 `private: true` 的包。`catalog:` 被改写成精确版本，`workspace:*` 被改写成成员的版本 `0.0.0`。后者在独立目录里不能解析，所以设施把闭包成员用 `pnpm.overrides` 指向各自的制品。
- `exports` 的 `source` 条件原样留在制品里，指向没有发布的 `./src/...`。Node 和 TypeScript 的 NodeNext 解析忽略它。设施用"解析结果不得落在 `src/`"检查它没有被走到。启用自定义条件 `source` 的消费者会解析失败，这是已知限制。
- 消费目录位于仓库的 `tmp/` 内，祖先有 `node_modules`。设施不禁止祖先存在，而是证明没有任何解析落到消费目录之外。异步的 `module.register` 钩子看不到 CommonJS `require`，所以改用同步的 `module.registerHooks`，并有只存在于祖先 `node_modules` 的 CJS 与 ESM 依赖作负例。`registerHooks` 在 Node 24 与 26 上运行时不再触发 DEP0205。
- 消费目录里的 `pnpm ls` 要加 `--ignore-workspace`，否则 pnpm 会采用仓库工作区，列出空结果。设施另检查"闭包成员与第三方依赖都出现在已安装列表"，防止这种空列表让禁止清单检查落空。
- 第三方包的精确版本取自工作区安装结果，其他版本会让离线安装找不到 tarball。

两个成员各有一份字节相同的 `tests/install/`，原因是 D-2 要求设施随成员维护，不建仓库级共享工具。改一份时同步另一份。

负例都在慢层（起子进程）：

- `tests/install-closure.spec.ts` 在成员清单的临时副本里注入 Cordis、`@omne-harness/model-host-local`、pi、厂商 SDK、分词引擎、存储引擎各一个，断言退出码为 1，报告点名被注入的包，且没有打包。真实的 `package.json` 不被修改。同一文件另证：`--work-dir` 指向成员目录、允许范围之外的目录或无标记的非空目录时退出码为 2 且内容保留，这几条都对测试自己在临时目录里造的成员运行，不指向任何仓库路径；用空的 pnpm 存储让 `--offline` 失败时，退出码为 1、`ok` 为 false、`install.mode` 为 `offline`。
- `tests/install-probe.spec.ts` 在手工搭的消费目录里证明：CJS 与 ESM 依赖只在祖先 `node_modules`、入口解析到 `src/`、声明依赖祖先里的类型，三种情况各自使对应检查失败；依赖放进消费目录的对照组通过。
- `tests/install-consumer.spec.ts` 对未修改的成员做真实打包与安装，断言报告的检查项 id 与预期的完整集合相等、`typeCheck.files` 大于 0、探针入口列表与 `exports` 一致，并在 `afterAll` 里删除它创建的 `tmp/install-closure/` 目录。

纯判断在快层的 `tests/install-judgment.spec.ts`：`inside`、制品源码、锁文件残留、解析与类型文件判断（含空列表必须失败）、`--work-dir` 护栏、联网回退决策（用替身运行器，不访问网络）、必需检查项清单。`finish()` 在所有检查通过但缺少必需检查项时，加入失败的 `required-checks` 并使报告 `ok` 为 false，所以漏接一个判断会使对真实成员的正例变红。

### 类型断言检查

共享的 oxlint 配置只启用 `correctness` 类别，其中没有标记类型断言的规则，所以用编译器 API 自写检查。它标记 `as T`、`<T>x` 和 `as unknown as T`，不标记 `as const`。唯一例外是 R-3 解码器内部的铸造点，须带注释 `brand-mint:`。例外必须在 `src/`（不含 `src/testing`），且最多一处。

### 未覆盖

- 类型消费的正例与负例（`*.spec-d.ts`）、替代提供者和六类夹具由后续阶段写。
- 清单比对不检查声明的形状，类型形状由类型消费检查负责。
- 安装闭包只证明依赖与解析，不证明运行行为。
- 离线安装依赖本机 pnpm 存储里已有的精确版本。存储里没有时，运行失败并在 `install` 检查里说明；设施不会自行联网。`--allow-network` 路径只由替身运行器的单元测试覆盖，没有真实联网的运行。
- 联网回退之后的检查（解析、类型）与离线路径相同，但回退本身访问的 registry 内容不被设施校验。
- 检查项是否接进报告由对真实成员的正例核对（完整 id 集合与 `finish()` 的必需项判定）。但判断函数收到的输入是否真实不在其内：`tarball-no-source` 与 `consumer-lock-no-workspace` 的判断函数有负例，若流程把空文件列表或空锁文件传给它们，检查项仍会出现并通过，正例不会变红。
