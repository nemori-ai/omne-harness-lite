---
id: RFC-0002
title: 工程工具链
revision: 2
status: accepted
owner: PanQiWei
---

# RFC-0002：工程工具链

规则与维护责任见[RFC入口](README.md)。PanQiWei 于 2026-10-14 接受 revision 1，记录见[接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6164802781)。同日接受 revision 2 的影响面选择。补充来源是[这条评论](https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6164742162)，接受记录是[这条评论](https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6165325011)。尚未验证的两项不在接受里。工具尚未切换。

> **更正标注（2026-10-19）**：原文与 status 不变。第 1 项是部分取代，同时记在「后继关系与维护」；第 2 项更正写回表的读法。依据是 [#390](https://github.com/nemori-ai/omne-harness-lite/issues/390) 的决定 D2 与 D6。
>
> 1. 「决定范围」中「类型检查用源码条件、全仓一次完成」一句，由 [RFC-0007](RFC-0007-source-packages-and-templates.md#声明与产物修改)「类型检查的入口」取代：每个成员的 `typecheck` 只运行 `tsc -p tsconfig.test.json`，不先构建，被测试导入的源码经 `source` 条件一并检查；turbo 的 `typecheck` 任务逐成员调度。见「后继关系与维护」。
> 2. 「写回现行正文」中「影响面选择」一行写「成员目录下的 `turbo.json` 仍会生效，因此一律拒绝」。「一律拒绝」是 #310 实施时的选择，不是本提案的决定。现行规则是：`packages/*`、`tools/*` 下的 `turbo.json` 拒绝；`apps/*` 下的由受信检查器按规则校验。规则见[开发指南](../development.md#迭代中的受影响测试)。

## 问题与有效输入

活跃仓库即将在新的 `packages/` 和 `apps/` 里放代码。现行工具链每次构建和类型检查都从头执行，通用检查很少，依赖方向只靠自写规则，而且不查文件之间的循环导入。这些缺口在新包还没有代码时改，成本最低。

[#227](https://github.com/nemori-ai/omne-harness-lite/issues/227) 用 legacy 的 78 个成员，在 2026-10-13 至 2026-10-14、一台 16 核 macOS、Node 24.21.0、pnpm 10.28.1 上做了实测。除全仓一次类型检查测了三次，其余场景大多只测一次。没有 Linux 或 CI 的数。这些数字只说明当时的量级。它们不是新工程的性能保证。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0001](RFC-0001-technical-foundations.md) revision 4 已接受 | 「编译与构建」保留 catalog 的 TypeScript 6。理由是 TypeScript 7 根入口不能直接承接 `createProgram` 和 `createSourceFile` | 本提案只提议后继这一条款。RFC-0001 的 status 保持 accepted |
| [#227](https://github.com/nemori-ai/omne-harness-lite/issues/227) | PanQiWei 在 #241 创建交接中接受该提案为输入。正文 SHA-256 为 `bf9ec9d424f8e5d410bbedf2033ac3463ffafb1271e0b75052fd80183bde0f01` | 九项建议和通用工具方针进入本提案。未定项保持未定 |
| [Issue #241](https://github.com/nemori-ai/omne-harness-lite/issues/241) revision 1 | 本卡不自动实施 #227 的全部升级。后续实施归 `integration/engineering-toolchain` | 本提案定义采用范围。它不声称切换已经发生 |

## 建议与改变范围

建议把通用的格式化、检查、依赖方向、无用依赖报告和任务缓存交给成熟工具。项目专有的 Cordis 服务关系和领域知识继续由 `tools/ts-checks` 一类工具拥有。编译和类型检查改用 TypeScript 7。仍要旧编程接口的工具从 `@typescript/typescript6` 导入。

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 技术基础的编译条款 | 保留 TypeScript 6 | 编译和类型检查用 TypeScript 7。旧编程接口的调用方使用官方兼容包 | 对外 `.d.ts` 不因换编译器而改变。兼容包的行为与 TypeScript 6 相同 |
| 格式化 | Prettier | 换 oxfmt。行宽 100、无分号、单引号、`trailingComma: all`、箭头函数单参数不加括号 | 重排差异要人接受后才实施。本提案不把重排标成已完成 |
| 任务编排 | `pnpm -r` 按依赖顺序执行，默认并发不超过 4。影响面由 `tools/ts-checks` 手写计算 | 用 turborepo 按输入缓存 `build` 和 `typecheck`。没改的成员跳过。影响面改用 `turbo run <task> --affected`，规则见下方补充 | 与下面的并发项二选一。上了 turborepo 就不再把 pnpm 并发调到核数。替换完成前，现行选择器继续执行，并保留未识别文件转全量 |
| pnpm 并发 | 默认 `min(核数, 4)` | 若不上 turborepo，把 `workspace-concurrency` 设为 `-1`，即核数减一 | CI 共享机器可以另设上限。这一项不是 turborepo 的补充 |
| 正确性检查 | 约 30 条自写结构规则，按单文件做语法分析 | oxlint 的正确性规则作门禁。测试风格规则只报告 | 新包从第一天打开正确性规则。`valid-expect` 和 `expect-expect` 的命中尚未逐条核实，不提前当成缺陷 |
| 依赖方向 | 自写规则约束分组方向，不查文件循环 | dependency-cruiser 检查方向和循环。分组方向用配置表达 | 配置保留 `dist` 但不深入它。排除 `dist` 会让跨包导入消失。Cordis 服务关系继续自写 |
| 无用依赖 | 没有通用报告 | knip 先只报告 | 未使用文件和未使用导出在配好入口前误报多，不作门禁。依赖声明以后可以再决定 |
| 新包约束 | 旧成员的 build、检查次数、循环和语法不一致 | 约束的成员侧写法在[新源码包提案](RFC-0003-source-packages.md)。其中包括 build 先清空 `dist`、源码只检查一遍、禁止包级循环，以及只用可擦除语法。本提案拥有检查这些约束的工具责任 | 同一条规则只有一个拥有者。成员如何满足，由包提案写 |
| 类型检查 | 成员通过 `dist` 的声明互相引用，所以必须先构建 | 增加只给类型检查用的源码条件导出，全仓一次检查 | 条件名定为 `source`。发布时去掉它，避免外部解析到不存在的 `src` |

[#227](https://github.com/nemori-ai/omne-harness-lite/issues/227) 的测量支持上面的方向，不支持把某一秒数写成承诺。TypeScript 7 下，按层排队的构建是 13.5 秒，绕开顺序后的参考值是 2.5 秒。全仓一次类型检查约 2.5 秒。turborepo 在什么都没改时是 0.2 秒。改底层包时几乎重跑。

### 影响面选择

这一节是 revision 2，已于 2026-10-14 接受。#227 只写了影响面计算有一部分可以交给 turborepo，没有给出机制，也没有在工作树里验证。`tools/ts-checks/src/testing/affected.ts` 手写的原因是，pnpm 的 `--filter "...[<since>]"` 在 git 工作树里匹配不到任何包，而实施都在工作树里进行。

建议用 `turbo run <task> --affected` 替换这份手写计算。AIEPhoenix 在 macOS arm64、turbo 2.11.7、pnpm 10.28.1 上，从 main `6d0e6ee0` 的干净工作树做了一次对照。被测的仍是旧成员。结果只说明选择机制，不代表新包的规模。pnpm 在这三行里仍是 0 个包。第三行的 pnpm 没有测。

| 改动文件 | `TURBO_SCM_BASE=<基准> turbo ls --affected` |
| --- | --- |
| `packages.0.0.1.legacy/core/identity-values/src/index.ts` | 66 个包 |
| `apps.0.0.1.legacy/cli/src/assembly.ts` | 1 个包，即 cli |
| `tsconfig.base.json`、`Makefile`、`docs/README.md` | 0 个包 |

由此得到三条观察。turbo 在工作树里选出改动包和它的全部下游。根目录文件默认不选中任何包。`tsconfig.base.json`、锁文件、共同 lint 和依赖规则配置必须写入 `globalDependencies`，否则会漏检。turbo 没有「未识别的文件按全量处理」这一条。`affected.ts` 现在有。替换之后要保留。

责任这样分。

- turbo 负责反向依赖闭包和按包运行的任务调度，包括构建、类型检查、测试和 knip。
- 仓库配置保留这些规则，不再另写选择算法。全局路径、测试读取成员目录以外的文件、Python 工具、常驻检查、legacy 排除、未识别文件转全量，以及每次选择的原因说明。读取成员目录以外文件的规则可以评估改写成 turbo 的 `inputs`。`--affected` 是否参考 `inputs`，还没有验证。
- dependency-cruiser 要整张依赖图，建议始终全量运行。在旧成员上全量约 1.8 秒，带 `--cache` 约 0.7 秒。它的 `--affected` 和 `--reaches` 只缩小报告范围，不减少解析量。跨包解析必须启用类型检查用的源码条件。这次实测把条件名写成 `source`。2026-10-14 按通行写法采用这个名字，发布时去掉该条件。不启用该条件时，没有 `dist` 的情况下，改 identity-values 的影响面只有 9 个模块，规则会空跑。
- knip 可以用 `--workspace` 按包运行。抽查 identity-values 时，单包结果与全量结果里该包的部分一致。原因是 knip 默认不检查公开入口的导出。

[RFC-0004](RFC-0004-trunk-pr-admission.md) 要求轨道和 main 的 PR 准入只跑受影响成员的检查，stable 才跑完整检查。它当前写的是沿用 `make check-plan` 和 `make test-affected`，也就是 `affected.ts` 的结果。若用 turbo 替换这条路径，替换后仍要满足四条约束。

1. 选择规则不能由 PR 修改。turbo 从检出的工作树读取 `turbo.json`。`globalDependencies` 和 `inputs` 决定选择范围。PR 改 `turbo.json` 就能缩小自己的检查范围。至少把 `turbo.json` 和其他选择配置列为全局文件，改动即全量。或者由受信检查器提供配置。turbo 能否从工作树以外指定配置，还没有验证。
2. 基线从平台取得，并显式传入。准入时用 `TURBO_SCM_BASE` 和 `TURBO_SCM_HEAD` 传入 RFC-0004 规定的基线。PR 阶段是与目标分支的共同祖先。合并队列阶段是队列组合的目标提交。不依赖 turbo 自己推断。检出深度要能取到基线提交。
3. 准入不信任缓存。缓存命中时任务不会真正运行。持有密钥的 job 不恢复缓存。检查 job 若读取 PR 能写入的缓存，就可能显示通过而实际没有运行。准入时应关闭缓存读取，或只读取受信运行写入的缓存。具体策略还要和 RFC-0004 一起决定。
4. 不能凭「没修改那个包」跳过它的消费者。`--affected` 包含全部下游包，满足这一条。上面的仓库特有规则仍要保留，否则会漏检。

暂不使用 `vitest --changed` 按文件选择测试。现在包 B 的测试经包导出读取包 A 的 `dist`，A 的源码不在 B 的模块图里。turbo 会选中 B，但 B 可能一个测试都不跑并报告成功。至少等测试改为直接读源码之后再评估。

还没有验证两件事。turbo 的 `--affected` 在 GitHub Actions 里如何取得基线，包括是否要 `fetch-depth: 0` 或先 fetch 目标分支。新包结构下的选择规模和耗时也没有测。

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 继续 TypeScript 6，只提高 pnpm 并发 | 少改编译条款 | 层与层的等待还在。旧编程接口的迁移被推迟，新包第一天就带上这条等待 | 放弃。#227 已把换编译器作为输入接受 |
| TypeScript 7，编程接口也直接改到新 API | 不引入兼容包 | `tools/ts-checks` 和 `tools/core-verification` 今天调用 `createProgram` 和 `createSourceFile`。一次性迁移超出本提案的证据 | 放弃。兼容包保持这些调用的行为 |
| 保留 Prettier | 没有重排差异 | 格式检查继续用较慢的实现 | 保留为可退回的备选。推荐 oxfmt，但重排差异未接受前不实施 |
| 自写规则继续承担「谁导入谁」 | 不增加 dependency-cruiser | 文件循环继续看不见 | 放弃通用部分。专有服务关系留下 |

## 验证与消费者切换

接受本提案之后，工程轨道负责实施。本提案的通过条件是文本覆盖，不是工具已经换上。

- 九项建议和通用工具方针都能在本文件找到处置。
- 未定项仍标成未定。
- RFC-0001 的历史决定文字不改。
- 切换时，声明文件用 TypeScript 6 再检查一次。编程接口调用方改从兼容包导入。
- 依赖规则的配置若排除 `dist`，这条切换不合格。
- 测试在可擦除语法和 schema 生成改完之前，仍要先构建。类型检查可以按本提案不先构建。这两件事分开验收。

## 决定范围

- 有权决定者：PanQiWei。
- 决定日期及对应 revision：2026-10-14。revision 1 记录为 https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6164802781 。revision 2 记录为 https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6165325011 。
- 采用范围：revision 1 的建议方案。通用检查交给成熟工具。Cordis 服务关系和领域知识继续自写。编译和类型检查用 TypeScript 7。旧编程接口从 `@typescript/typescript6` 导入。格式化换 oxfmt，选项沿用现有 Prettier 选项。任务缓存用 turborepo。上了 turborepo 就不再把 pnpm 并发调到核数。oxlint 的正确性规则作门禁，测试风格只报告。dependency-cruiser 检查方向和循环，配置保留 `dist` 但不深入它。knip 先只报告。类型检查用源码条件、全仓一次完成。revision 2 采用 `turbo run <task> --affected` 作为影响面目标。替换完成前保留现行选择器。未识别文件转全量。`turbo.json` 和其他选择配置的改动按全量。准入基线显式传入。准入不读取 PR 能写入的缓存。dependency-cruiser 始终全量，并启用源码条件。不使用 `vitest --changed`。
- 不采用范围及必要理由：不采用继续把 TypeScript 6 当作编译和类型检查的编译器。不采用把编程接口直接改到 TypeScript 7 根入口。不采用 #227 的测量作为新工程的性能保证。不采用在本次接受时实施工具切换或改写技术基础页。
- 未决与依赖停止点：
  - 依赖层数的上限。裁定者是 PanQiWei。恢复输入是新包依赖图。
  - 源码条件名已于 2026-10-14 按通行写法定为 `source`。仓库类型检查打开这个条件。发布时去掉它，外部只保留指向 `dist` 的 `types` 和 `import`。
  - 合并类型检查是否保留逐成员的 `resolveJsonModule` 和 `jsx` 严格程度。
  - 远程缓存是否启用。公开仓库只能让受信分支写入。
  - knip 的哪些类别以后成为门禁。
  - pnpm 并发写在 `pnpm-workspace.yaml` 还是 `.npmrc`。只有不采用 turborepo 时才需要。
  - oxfmt 与 Prettier 的重排差异是否接受。
  - turbo 的 `--affected` 是否参考 `inputs`，以及能否从工作树以外读取配置。这两项还没有验证，不能先写成已经成立。准入缓存只读受信运行，还是完全关闭读取，仍要和 RFC-0004 一起定具体策略。规则本身已经接受。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 编译与构建改为 TypeScript 7，旧编程接口走兼容包 | [技术基础](../architecture/technical-foundations.md) 的编译行，源头是 RFC-0001 revision 4 | 已写回 | 2026-10-14 写入目标条款。2026-10-15 由 [#310](https://github.com/nemori-ai/omne-harness-lite/issues/310) 切换：catalog 钉 TypeScript 7.0.2，`make declarations-check` 用 TypeScript 6 再检查对外 `.d.ts` |
| 格式化改用 oxfmt | [开发指南](../development.md#格式化) | 已写回 | 2026-10-15 由 [#310](https://github.com/nemori-ai/omne-harness-lite/issues/310) 切换。`packages/` 与 `apps/` 暂不纳入，重排时间由源码包负责人另定。范围内的重排差异只有 dev tools 的 10 个文件，接受记录见 #310 |
| 正确性检查用 oxlint | [开发指南](../development.md#通用静态检查)与[验证说明](../verification.md) | 已写回 | 2026-10-15 由 #310 接入。correctness 类对 `tools/`、`scripts/` 作门禁；`packages/`、`apps/` 暂只报告，与格式一起另定。测试风格规则只报告 |
| 依赖方向与循环用 dependency-cruiser | 同上；方向规则的出处见[产品包组织](../package-organization.md#依赖方向与cordis集成) | 已写回 | 2026-10-15 由 #310 接入。无法解析的导入、文件级运行时循环、legacy 引用与能按成员路径表达的方向规则对全部目录作门禁，成员与组之间的环在同一张图上算；启用 `source` 条件，`dist` 保留不深入。ts-checks 的 `group-direction` 与自写成员图退役，clean loop 的硬线、新增跨成员依赖、`make metrics` 与架构报告都读这张图。dependency-cruiser 18 只支持 TypeScript 6 以下，经 `packageExtensions` 单独配 TypeScript 6.0.3。按角色判断的方向暂未表达 |
| 无用依赖用 knip | 同上 | 已写回 | 2026-10-15 由 #310 接入，只报告 |
| 通用工具优先、专有检查留下 | [质量与风险](../engineering/quality.md)。根 `AGENTS.md` 已有「复用成熟机制」，不另写工具名单 | 已写回 | 2026-10-14 写入 quality.md。2026-10-15 由 [#310](https://github.com/nemori-ai/omne-harness-lite/issues/310) 接入 oxlint、dependency-cruiser 与 knip，见下面三行 |
| 影响面选择 | [开发指南](../development.md#迭代中的受影响测试) | 已写回 | 2026-10-14 接受 revision 2。2026-10-15 由 [#310](https://github.com/nemori-ai/omne-harness-lite/issues/310) 替换：成员选择用 `turbo ls --affected`，构建用 `turbo run build`；读者、全局、Python、常驻与未识别文件的规则留在 `test-runs.config.json`。turbo 2.11.7 实测：`--affected` 默认不参考任务 `inputs`（只在 `futureFlags.affectedUsingTaskInputs` 下参考，未采用）；`TURBO_ROOT_TURBO_JSON` 能从检出之外读根配置，但成员目录下的 `turbo.json` 仍会生效，因此一律拒绝。四条约束的落实见开发指南。更正标注（2026-10-19）：成员目录下 `turbo.json` 的处理按 #390 的 D6 修订，见开头的更正标注 |
| 任务调度与构建缓存 | [开发指南](../development.md#迭代中的受影响测试)与[测试运行器](../../tools/test-runner/README_ZH.md#测试运行) | 已写回 | 2026-10-19 由 [#390](https://github.com/nemori-ai/omne-harness-lite/issues/390) 切换：构建、类型检查与成员测试都是 turbo 任务（`build`、`typecheck`、`test:fast`、`test:slow`、`test`），层由 vitest 的 mode 选择。构建读写本地缓存，准入时只写不读。测试任务不缓存。远程缓存仍未决定 |
| 按输入缓存类型检查 | 同上 | 待写回 | 建议方案写「用 turborepo 按输入缓存 `build` 和 `typecheck`」。截至 2026-10-19 `typecheck` 任务不缓存：缓存键（依赖成员源码改动后能否重新运行）还没有验证，见 #390 的判据 C3 |

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 本提案 revision 1，2026-10-14 接受 | 只取代 RFC-0001 revision 4「编译与构建」中「保留 catalog 的 TypeScript 6」这一条款。其余条款不动。RFC-0001 的 status 不改。目标已写入技术基础页。2026-10-15 由 #310 切换实现 | [技术基础](../architecture/technical-foundations.md) |
| [#390](https://github.com/nemori-ai/omne-harness-lite/issues/390) 的决定 D2（2026-10-19），依据 [RFC-0007](RFC-0007-source-packages-and-templates.md) revision 1（2026-10-16 采用） | 只取代「决定范围」中「类型检查用源码条件、全仓一次完成」这一句。类型检查改为逐成员运行，见 RFC-0007「类型检查的入口」。其余条款不动，本提案的 status 不改 | [开发指南](../development.md#迭代中的受影响测试) |
