---
id: RFC-0007
title: 源码包与包模板
revision: 1
status: accepted
owner: PanQiWei
---

# RFC-0007：源码包与包模板

规则与维护责任见[RFC入口](README.md)。本提案取代 [RFC-0003](RFC-0003-source-packages.md) revision 1 除「测试」一行以外的全部采用范围。「测试」一行已由 [RFC-0005](RFC-0005-package-testing.md) 取代，本提案只引用。本提案把 RFC-0003 仍然有效的条款、[#332](https://github.com/nemori-ai/omne-harness-lite/issues/332) 已经实施的工具归属变化，以及 [#343](https://github.com/nemori-ai/omne-harness-lite/issues/343) 要求的统一模板骨架写在一处。它不是实施许可。提案采用、规范写回、模板实现和交付接受分别判断。2026-10-16 采用本提案 revision 1，记录见 [#352 的决定](https://github.com/nemori-ai/omne-harness-lite/issues/352#issuecomment-6212688730)。规范写回与模板实施由 [#358](https://github.com/nemori-ai/omne-harness-lite/issues/358) 完成，模板版本为 `typescript-package@3.0.0`，见「写回现行正文」。

> **更正标注（2026-10-16）**：实施 #358 时发现本提案有三处表述与同节或现行约定不一致。原文保留，本标注只更正读法，不改变本提案的决定。
>
> 1. 「占位、不适用与完成」的状态表把“刚生成的骨架”的结构扫描写作“通过，并报告 `draft`”。同节上一段写明 `PACKAGE_TEMPLATE_DRAFT` 的读数“与现行规则相同”，即 `draft` 使结构判失败、`--check` 退出 1。实施按后者：结构扫描为失败，并报告 `draft`。
> 2. 同一状态表把骨架章节的 inventory 读数写作 `placeholder-only`。文件级占位读作 `placeholder-only`；章节级占位的 `status` 是 `missing-section`，`reason` 是 `section body: placeholder-only`。实施在每个骨架文件的首个二级标题前放文件级占位，因此文件读作 `placeholder-only`，其章节读作 `missing-section`。
> 3. 「验收目录的配置条件」把可执行场景的判定写作 `*.ts`。现行约定（[workspace](../workspace.md) 的可执行验收与 `tools/product-checks` 的覆盖检查）只认 `*.acceptance.ts`。实施按 `*.acceptance.ts` 判定，`acceptance/` 下的辅助 `.ts` 不算场景。

RFC-0003 的比较基准是接受时的原文，即写回提交 [`a50bcb0b`](https://github.com/nemori-ai/omne-harness-lite/blob/a50bcb0b/docs/rfcs/RFC-0003-source-packages.md) 中的版本。每条条款标出来源：

- **沿用**：接受原文的条款，本提案不改变含义，只更新链接。
- **修改**：接受原文的条款被已实施的变化或本提案改变。每条写明改了什么、依据是什么。
- **新增**：接受原文没有的条款。

## 问题与有效输入

RFC-0003 revision 1 规定了源码包怎样成为可安装、可检查的成员，以及正式模板结构。接受之后发生了四件事：

1. RFC-0002 定下了源码条件名 `source`。#310 让成员的 `typecheck` 不再先构建。新包的作用域是 `@omne-harness`。
2. #332 拆分了 `tools/ts-checks`，删除了 `tools/core-verification`，包模板改由不发布的 `tools/dev-flow` 维护。
3. 上面两项的事实被直接写进了已接受的 RFC-0003 正文。2026-10-14 至 2026-10-16 的提交 `145ef56e`、`fc35bfac`、`74c1c928`、`e2492bd5` 与 #344 的提交改动了其中的条件名、包名、生成器状态与「决定范围」。RFC 入口规定决定后的方案与决定范围固定，这些改动已撤回并加更正标注，变化由本提案承接（见「后继关系与维护」）。
4. #343 要求修订“源码包的正式模板结构”：新包创建时就生成完整、可导航的文档与目录骨架，替换“只有真实内容才建目录、不生成占位规格”的规则。这些要求还没有实施。

不处理的后果：现行规范、RFC-0003 和工具事实三者不一致；新包作者读到的模板规则与 #343 的要求冲突；#343 的实施没有可引用的已接受依据。

| 当前要求或承诺 | 核对修订与条款 | 本提案受什么约束 |
| --- | --- | --- |
| [RFC-0003 接受原文](https://github.com/nemori-ai/omne-harness-lite/blob/a50bcb0b/docs/rfcs/RFC-0003-source-packages.md) | revision 1，accepted，[接受评论](https://github.com/nemori-ai/omne-harness-lite/issues/241#issuecomment-6165074528) | 沿用条款保持原含义。取代不改写原接受记录 |
| [RFC-0005](RFC-0005-package-testing.md) | revision 1，accepted；已取代 RFC-0003「测试」一行 | 测试责任由 RFC-0005 拥有。本提案不重新决定 |
| [RFC-0002](RFC-0002-engineering-toolchain.md) | revision 2，accepted | `source` 条件、TypeScript 7、dependency-cruiser 与可擦除语法的检查责任归它。本提案不复制工具选型 |
| [#343](https://github.com/nemori-ai/omne-harness-lite/issues/343) 正文 | 交付修订 2：用户明确要求 1 至 6、目录与文档落点 proposal、验收 C1 至 C6 | 「新增」条款逐条落位这些要求，对照见「验证与消费者切换」 |
| [#343 补充评论](https://github.com/nemori-ai/omne-harness-lite/issues/343#issuecomment-6208268601) | 2026-10-16，接受后的最低同步范围 | 写回表至少覆盖这张表 |
| [#332 分包决定](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6207053294)与[更正](https://github.com/nemori-ai/omne-harness-lite/issues/332#issuecomment-6207559849) | 2026-10-16，卡负责人 AIEPhoenix 决定，已实施 | 「模板与检查器的归属」来自这里 |
| [包组织](../package-organization.md#成员的必选结构) | RFC-0003 写回后的现行正文 | 沿用条款的当前位置 |
| [包模板说明](../../tools/dev-flow/templates/package/README_ZH.md)与 `manifest.json` | `typescript-package@2.0.0`；`previousVersions` 保留 1.0.0；固定规则集 ruleSet 2 | 新模板版本须保留这两个历史版本的精确判定 |

本提案不处理：[#290 评论 6201839111](https://github.com/nemori-ai/omne-harness-lite/issues/290#issuecomment-6201839111) 列出的工程基线既有失败；检查器的发布、钉版本与工具链变更闸门，它们属于 RFC-0004 的责任，由另一份提案处理。

## 建议与改变范围

| 受影响拥有者 | 现行保证或机制 | 拟改变内容 | 必须保持的条件与例外 |
| --- | --- | --- | --- |
| 包组织 | [成员的必选结构](../package-organization.md#成员的必选结构) | 必选节点扩大为完整骨架；目录与专题在创建时生成 | 必选文件、`package.json` 形状与 `src/cordis.ts` 规则不变；应用不使用本模板 |
| 成员文档 | [成员文档](../member-documentation.md) | 固定骨架从按需建页规则中单列，补根目录说明、各文件职责、导航、占位与完成条件 | 公开类型、`SPEC.md` 与接口导航各有唯一责任 |
| 包模板与扫描 | `tools/dev-flow` 的 `typescript-package@2.0.0` | 新模板版本：完整生成树、每目录入口、专题可升级为同名目录、验收配置条件改变 | 2.0.0 与 1.0.0 的历史判定完整保留；现有成员不自动迁移 |
| 文档登记 | `tools/spec-tools` 的文档 inventory | 登记新增必需文件与章节；占位、不适用、完成分别可观察 | 占位仍计缺项 |
| 验收锁 | `make acceptance-lock` | 模板生成的验收占位怎样计入，见下文 | 实施角色不能改弱真实验收 |

### 成员定义与边界（沿用）

一个成员是拥有 `package.json`、源码、依赖、公开入口和验证的目录。能力组目录不是成员。预留的 README 不是成员。成员按[包组织](../package-organization.md)已有的分组落入。拆包依据是真实消费者和依赖边界，不是技术角色目录。不把 common、time、telemetry、assembly 变成杂物目录，不为尚无实现的目标造空成员。没有消费者的预留目录保持目录。

本提案不搬迁 legacy 旧包，也不建立转发层。缺少技术接受的部分不获得实施资格。临时样例不留在产品目录。

依赖方向沿用包组织和架构分层。CLI 通过 SDK 消费。命令解析模块不导入 `@deepseek-ai/cordis`。SDK 不导入 server-entry。这些边界来自 #218 的已接受结论，本提案不放宽。

### 成员规则（沿用）

成员满足 RFC-0002 交给包提案拥有的四条规则：

1. `build` 先清空 `dist`。
2. 源码的类型检查只有一条责任路径。构建不兼任日常类型检查。
3. 禁止包级循环，包括 devDependency。
4. 源码只用可擦除的 TypeScript 语法，以便 Node 24 能直接执行。构造函数参数属性、`enum` 和 `namespace` 不进入新包。

依赖层数的上限未定。未定之前，新包不得形成比当前已有成员更深的依赖链。

### 声明与产物（修改）

类型检查按 RFC-0002 的源码条件读源码，不先构建。构建产出 `dist`。运行和发布消费 `dist`，除非该成员已证明 Node 能直接执行其源码。发布包不含 `src`。（沿用）

修改三处，均已实施并写回[包组织](../package-organization.md#成员的必选结构)：

- 源码条件名：接受原文写“未定，归 RFC-0002”。改为 RFC-0002 已定的 `source`，写在 `types` 前面，发布时去掉。
- 包名作用域：接受原文写 `@omne-harness-lite/<成员>`。改为 `@omne-harness/<成员>`。
- 类型检查的入口：接受原文写“成员自己的脚本不再跑第二遍类型检查。全仓类型检查读取源码条件，不把 `src` 再编进 `tsconfig.test.json`”。改为 #310 实施的做法：每个成员的 `typecheck` 只运行 `tsc -p tsconfig.test.json`，不先构建；被测试导入的源码经 `source` 条件一并检查；`tsconfig.test.json` 仍只包含 `tests`。

```json
{
  "name": "@omne-harness/<成员>",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.test.json"
  }
}
```

`tsconfig.build.json` 只包含 `src`，并打开 `erasableSyntaxOnly`。测试导入本包时使用包名，不写 `../dist/index.js`。（沿用）

`cordis-module`、`service-contract` 和 `service-provider` 另有 `src/cordis.ts`。`module` 没有这个文件。根入口 `src/index.ts` 不导入 `@deepseek-ai/cordis`。Cordis 绑定只从 `src/cordis.ts` 导出。（沿用）

测试责任：谁写哪一类测试由 [RFC-0005](RFC-0005-package-testing.md) 与[包级测试责任与边界](../verification.md#包级测试责任与边界)拥有。

### 首批候选（修改：记录现状）

接受原文的首批候选表保留为历史。现状：

| 候选 | 现状 |
| --- | --- |
| `packages/common/legal-identity` | 已是成员。消费者是 `tools/product-checks` 的身份形状规则，对旧包 `identity-values` 的导入已移开 |
| `packages/common/utc-instant` | 已是成员 |
| `packages/assembly/kernel-basis` | 已是成员 |
| 存储事务规格的承接成员 | 不是成员。`packages/storage/storage` 目录只有 `README.md` 与 `SPEC.md`，没有 `package.json`。包名仍未决 |

`tools/core-verification` 已在 #332 删除。接受原文中依据它的清点，以及“其余旧依赖的新拥有者”这一未决项，不再适用。

### 模板与检查器的归属（修改）

| 对象 | 接受原文 | 本提案 |
| --- | --- | --- |
| 包模板 | 由 `tools/ts-checks` 的包模板维护，不在仓库根另设模板目录 | 由不发布的 `tools/dev-flow` 维护，不在仓库根或其他位置另设模板副本。模板版本即 `manifest.json` 的 `version` |
| 结构扫描 | `tools/ts-checks` | `tools/dev-flow` 的 `package:template scan` |
| 依赖方向与环 | 旧三层方向检查，尚待适配 | `@omne-harness/repo-config` 预设中的 dependency-cruiser 规则，经 `pnpm run lint:deps` 执行 |
| 产品与仓库规则 | `tools/ts-checks` | 不发布的 `tools/product-checks` |
| 文档登记与占位 | 未涉及 | `tools/spec-tools` 的文档 inventory |

这些成员怎样发布、怎样钉版本、改动它们的 PR 经过什么确认，归现行正文（[workspace](../workspace.md)、[现行准入](../engineering/integration.md#现行准入)）与 RFC-0004 的后继提案。本提案不决定这些事项。

接受原文列出的已知缺口，更新为：

- 旧的三层方向检查已退役。能按成员路径表达的方向规则由 dependency-cruiser 检查，见[包组织](../package-organization.md#现有成员与工具适配)。（修改）
- SDK 与 server-entry 互不导入已由 `sdk-not-server` 与 `server-entry-not-sdk` 两条规则表达。（修改）
- 按角色判断的方向（契约不依赖其提供者、提供者经接口接入）没有机读的角色标记，仍靠评审。（新增，记录现状）
- 应用模板还不能表达「应用装配 Cordis、命令解析不导入 Cordis」。（沿用）

### 源码包的正式模板结构（修改与新增）

本节替换接受原文中三句：“下面的目录只有在里面有真实内容时才存在。模板不生成空目录，也不生成占位规格”，以及“现有模板 README 里的大树是可选资源角色，不是每个新包都要建满的目录”。

**必选文件（沿用）。** 每个新成员必须有：`package.json`、`README.md`、`README_ZH.md`、`documentation.json`、`src/index.ts`、至少一个 `tests/<行为>.spec.ts`、`tsconfig.build.json`、`tsconfig.test.json`、`vitest.config.ts`。绑定变体另有 `src/cordis.ts`。缺任何一个，模板生成不合格。

**完整生成树（新增）。** 新模板版本创建下面全部节点。除标注“仅绑定变体”的两项外，四个变体都生成同一棵树。树中每个节点都是新模板版本的必需节点：缺任何一个，结构扫描判失败。`README.md + index.md` 表示该目录同时生成两个文件。

```text
packages/<能力组>/<成员>/
├── README.md
├── README_ZH.md
├── index.md
├── SPEC.md
├── documentation.json
├── package.json
├── docs/                         README.md + index.md
│   ├── architecture.md
│   ├── flows.md
│   ├── object-model.md
│   ├── public-api.md
│   ├── context.md
│   └── cordis.md
├── src/                          README.md + index.md
│   ├── index.ts
│   └── cordis.ts                 仅绑定变体
├── tests/                        README.md + index.md
│   ├── public-entry.spec.ts
│   ├── cordis-entry.spec.ts      仅绑定变体
│   └── fixtures/                 README.md + index.md
├── schema/                       README.md + index.md
├── verification/                 README.md + index.md
│   ├── models/                   README.md + index.md
│   └── proofs/                   README.md + index.md
├── adr/                          README.md + index.md
├── examples/                     README.md + index.md
├── resources/                    README.md + index.md
├── acceptance/                   README.md + index.md
│   └── fixtures/                 README.md + index.md
├── tsconfig.build.json
├── tsconfig.test.json
└── vitest.config.ts
```

`SPEC.md` 对 `module` 变体也是必需节点。这改变了现行“`module` 不要求 `SPEC.md`”的规则：纯函数或值包在 `SPEC.md` 中写实际承诺，没有非类型行为时写明理由。

模板中代表未来任意模块的通配槽（`src/**/*.ts`、`tests/**/*.ts` 等）不实例化。`dist/`、`node_modules/`、`generated/`、`coverage/` 和 `tmp/` 不属于源码模板，不预建。

**专题职责（新增）。** 五类专题与 Cordis 文档放在 `docs/`，包根保留入口与行为规格：

| 文件 | 承载的信息 | 与其他正文的关系 |
| --- | --- | --- |
| `docs/architecture.md` | 包内模块划分、依赖方向、状态与资源归属、关键机制及设计理由 | 解释本包怎样兑现 `SPEC.md`，引用组级与系统级约束 |
| `docs/flows.md` | 关键业务流程与数据流 UML：参与者、调用时序、数据来源与去向、状态变化、失败分支、生命周期 | 用可维护的文本图源，图旁写前提与边界。初始只给待补章节与图示位置，不编造流程 |
| `docs/object-model.md` | 内部 OOP 建模：对象职责、身份、状态、关联、组合、继承、生命周期，配 UML 类图 | 不强迫实现改成 class。纯函数或值包仍生成文件，由维护者写实际模型与不适用项 |
| `docs/public-api.md` | 公开边界、导出入口、调用者资格、接口设计与定义索引、输入输出与失败行为的定位 | 精确类型与运行时校验归公开源码。可链接源码或生成签名参考，不手写第二套签名；非类型行为的唯一正文仍是 `SPEC.md` |
| `docs/context.md` | 消费侧怎样使用本包、具名上层消费者、典型调用关系，以及本包在系统与能力组中的定位图 | 同时覆盖独立包消费和适用的 Harness 接入。引用系统架构和真实消费者，不成为新的系统架构源 |
| `docs/cordis.md` | Cordis 适用性、集成入口、依赖注入、服务与事件、启动、撤除与资源清理责任 | 所有变体都生成。`module` 写明不适用的理由；文件存在不导致生成 `src/cordis.ts` 或引入 Cordis 依赖 |
| `SPEC.md` | 本包公开的结果、不变量、失败、所有权、生命周期、并发、事务、取消与恢复等必要行为 | 与 `docs/public-api.md` 共同覆盖公开契约：前者拥有行为正文，后者拥有公开定义的导航 |

现有可选片段与新专题的关系：`fragments/docs/internals.md.tpl` 并入 `architecture.md`，`api.md.tpl` 并入 `public-api.md`，`usage.md.tpl` 并入 `context.md`。`configuration.md`、`maintenance.md` 与 `guides/` 仍是按需取用的可选专题，不进入必需骨架。同一信息只有一个承载文件。

**目录入口（新增）。** 包根 `README.md` 与 `README_ZH.md` 保留现有必要栏目，新增“目录结构与文档职责”栏目，展示实际初始树并链接每类目录与专题，两种语言表达同一承诺。各目录 `README.md` 说明本目录的用途、允许的内容、边界与维护责任，并标出待补的本包事实。各目录 `index.md` 列出本目录的文件、子目录与阅读路径，链接唯一正文，不复制 README 的职责说明。`src/index.md` 是文档导航，`src/index.ts` 是代码入口。

| 位置 | 初始文件须说明的职责 |
| --- | --- |
| `docs/` | 内部设计、公开使用与集成说明，向唯一契约与定义导航 |
| `src/` | 公开定义、运行时校验与内部实现 |
| `tests/`、`tests/fixtures/` | 本包适用的持续测试与固定输入，说明真实依赖、替身与测试范围 |
| `schema/` | 对外 Schema、稳定身份与发布消费说明；占位不是已发布的 Schema |
| `verification/`、`models/`、`proofs/` | 持续验证资源、模型、论证或证明，说明性质、前提、命令、覆盖与限制 |
| `adr/` | 有持续消费者的实现取舍与必要理由；单次评审与执行日志归任务 tmp |
| `examples/` | 面向真实公开入口的使用示例与运行前提 |
| `resources/` | 运行所需的非源码资源，以及来源、许可、读取与发布要求 |
| `acceptance/`、`acceptance/fixtures/` | 独立验收者维护的场景、操作说明与固定输入；占位不表示已有验收能力 |

**专题可以升级为同名目录（新增）。** 对主题名 `<topic>`，`docs/<topic>.md` 与 `docs/<topic>/` 都可以承载该主题。校验按文件名去掉 `.md` 后的名称或目录名识别同一主题。

- 初次生成创建 `.md` 文件。拆分时内容迁入同名目录，校验不再要求保留原文件。
- 升级后的主题目录必须有 `README.md`（主题职责、范围与内容组织）和 `index.md`（导航到拆分后的正文）。`docs/README.md` 与 `docs/index.md` 继续是 docs 总入口。
- 拆分时同步包根与 docs 入口的链接、章节锚点及 `documentation.json` 的实际承载路径。
- 正例：只有 `docs/flows.md`；只有带 `README.md` 与 `index.md` 的 `docs/flows/`。
- 反例：文件与目录都不存在，报告主题缺失；同名目录缺 `README.md` 或 `index.md`，报告入口缺失；同名空目录不能代替完整结构；`docs/flows.md` 与 `docs/flows/` 同时存在，报告主题重复，因为同一主题只能有一个承载位置。

**占位、不适用与完成（新增）。** 复用现有两套标记，不新造协议：

- 代码与包根 README 的草稿继续使用 `PACKAGE_TEMPLATE_DRAFT`。结构扫描报告 `draft`，`--check` 退出 1，不能写采用标识。这一点与现行规则相同。
- 新骨架中的 Markdown（目录 `README.md`、`index.md`、`docs/` 专题、`SPEC.md`）的每个待填章节使用文档协议的 `<!-- documentation:placeholder -->`，并在 `documentation.json` 登记。它们不带 `PACKAGE_TEMPLATE_DRAFT`。
- 某个目录或专题对本包不适用时，维护者把占位改成写明理由的正文，并在 `documentation.json` 中把该目标的 `applicability` 记为 `not-applicable`。文件仍然保留。

四类状态的预期读数：

| 状态 | 结构扫描 | `--check` | 采用标识 | 文档 inventory |
| --- | --- | --- | --- | --- |
| 刚生成的骨架 | 通过，并报告 `draft` | 退出 1 | 不能写 | 骨架章节为 `placeholder-only` |
| 缺必需节点 | 失败 | 退出 1 | 不能写 | 缺的目标为 `missing-file` |
| 代码完成、文档仍有占位 | 通过 | 退出 0（其余条件满足时） | 可以写 | 仍报告 `placeholder-only`，计为缺项 |
| 已写明不适用 | 通过 | 退出 0（其余条件满足时） | 可以写 | `not-applicable` |

文档占位不阻止采用标识，因为结构采用与正文完成是两件事；但占位在 inventory 中始终计为缺项，不能计为设计完成或通过验收。

**验收目录的配置条件（修改）。** 现行 manifest 规定 `acceptance/` 与 `vitest.acceptance.config.ts` 互相要求。改为：

- 判定依据：`acceptance/` 下（不含 `acceptance/fixtures/`）至少有一个 `*.ts` 文件，即“有可执行的验收场景”。
- 有可执行场景时，必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本。
- 有 `vitest.acceptance.config.ts` 时，必须有可执行场景。（保留现行的反向要求，按新判定依据表达）
- 只有占位文件时，不要求配置，测试运行器不选这个成员跑验收，读数是“无可执行验收场景”，不报告通过。

**验收锁（新增）。** `make acceptance-lock` 列出碰过成员 `acceptance/` 的提交。新包生成的 `acceptance/README.md`、`index.md` 及 `acceptance/fixtures/` 的入口文件是模板占位。只含 `<!-- documentation:placeholder -->` 占位、未写入场景的这些文件不计为验收改动；写入真实内容后照常计入。

**扫描规则（修改）。** 所有固定目录的 `README.md` 与 `index.md` 进入 manifest 与结构扫描的允许路径，包括主要容纳源码或特定资源格式的目录。不能只生成文件而让扫描拒绝，也不能用 ignore 隐藏它们。

**模板版本与历史（新增）。** 新骨架是新的模板版本，版本号由工具拥有者 AIEPhoenix 在实施时确定。`previousVersions` 完整保留 2.0.0 与 1.0.0 的必需文件、变体、全量布局与固定 ruleSet 2 语义。旧标识继续报告为 older，不静默套用新要求。

**现有成员（新增）。** 新骨架只用于新建的包。现有成员先清点差异，再另行给出迁移范围与时点。补文件不得覆盖真实正文。本提案不授权批量迁移。

**发布范围（新增）。** 创建文档不改变运行导出、安装依赖或发布文件集合。需要发布的真实规格和资源，仍由对应责任明确声明。

**并行范围（修改）。** 接受原文允许“身份包的契约草案”与无导入关系的文档写回并行，该身份包已经建立。现在：模板实施与现有成员的迁移不能由两个写者同时改；两个写者不同时改根锁文件、包模板或 Issue 摘要。（后一句沿用）

## 实质备选

| 方案 | 如何满足目标 | 代价、风险和失败后果 | 推荐或放弃理由 |
| --- | --- | --- | --- |
| 直接把 RFC-0003 改为 revision 2 | 一份文件表达全部规则 | RFC 入口规定决定状态不重开、新决定另开提案；会改写已接受的原文 | 放弃 |
| 只部分取代 RFC-0003 的模板一节与工具归属句 | 改动最少，RFC-0003 其余条款继续有效 | 读者要同时读两份提案才能拼出现行规则；已实施的变化散在多处 | 放弃。取代后现行规则只有一个提案来源，代价是要完整带过沿用条款 |
| 保持“真实内容才建目录”，只扩充可选专题片段 | 不改模板结构，不生成占位 | 不满足 #343 用户要求 1 至 4 | 放弃 |
| 五类专题放在包根 | 根目录直接可见 | 包根文件过多，入口与专题混在一起 | 放弃。包根保留入口与 `SPEC.md`，专题集中在 `docs/` |
| 文档占位也阻止采用标识 | 占位必须全部清除才能采用 | 没有 Schema 或模型的包长期无法采用，或被迫删掉骨架 | 放弃。用 inventory 的缺项与 `not-applicable` 分别表达 |

## 验证与消费者切换

#343 用户要求到本提案条款的对照（C1）：

| #343 要求 | 本提案条款 | 替换的旧规则 | 保留范围 |
| --- | --- | --- | --- |
| 1. 原按真实内容才建的目录与规格全部生成 | 完整生成树 | “只有真实内容才存在”“不生成占位规格” | 通配槽与构建产物不预建 |
| 2. 每目录 `README.md` 与 `index.md`，并生成 `cordis.md` | 完整生成树、目录入口、专题职责 | 同上 | `src/cordis.ts` 仍只在绑定变体 |
| 3. 包根 README 说明目录结构与职责 | 目录入口 | 无 | 现有必要栏目保留 |
| 4. 五类文档 | 专题职责 | “模板 README 的大树是可选资源角色” | 公开类型、`SPEC.md` 的唯一责任 |
| 5. 五类文档的落点 | 专题集中在 `docs/` | 无 | 包根保留入口与 `SPEC.md` |
| 6. 主题文件可升级为同名目录 | 专题可以升级为同名目录 | 无 | 初次生成仍是 `.md` 文件 |

其余检查项：

| 检查 | 内容 | 证据 |
| --- | --- | --- |
| C2 | 完整生成树、每个目录 README 与 index 的职责、六份 docs 专题与 `SPEC.md` 的责任；没有重复的接口定义源 | 对照 `manifest.json` 的固定目录、变体文件与 fragments 做独立表达复核 |
| C3 | 占位与完成的区别、各变体的 Cordis 适用性、验收目录与配置的条件、登记与扫描的调整 | 「占位、不适用与完成」中四类状态的预期读数 |
| C4 | 规范写回、模板版本、现有成员迁移与工具协调责任；历史版本规则不丢失，不覆盖真实正文 | 写回表与后续交接说明 |
| C5 | 本提案与 RFC-0003 revision 1 的决定分开，取代关系与写回关系清楚 | PanQiWei 的具名决定；接受原文未被改义 |
| C6 | 主题文件与同名目录的正例和反例 | 「专题可以升级为同名目录」中的正反例 |

实施任务另行验证：四个变体的完整骨架；四类状态的扫描与 inventory 读数；只有占位的 `acceptance/` 不被选去跑验收；带旧标识的现有成员仍报告 older；主题升级为目录后扫描与 inventory 仍识别同一主题。依赖方向的反例（旧路径、旧包名、经第三包的间接旧包导入）由 dependency-cruiser 检查，它已由 #310 接入。（修改：接受原文写“该工具未安装前不得写成已拦住”）

需要切换的消费者：

- 模板生成器、`manifest.json`、公共模板文件、各变体与 fragments、模板版本及历史规则（`tools/dev-flow`）。
- 结构扫描、文档目标发现、占位识别与采用标识，以及它们的测试、夹具与示例（`tools/dev-flow`、`tools/spec-tools`）。
- 测试运行器选择验收成员的条件（`tools/test-runner`），与验收锁（`make acceptance-lock`）。
- 新包作者，以及现有成员维护者（只在另行授权的迁移中）。
- 引用旧规则的开发工具入口、指南、局部 AGENTS、skills 与角色。

## 决定范围

- 有权决定者：PanQiWei，决定本提案全部范围（RFC-0003 的拥有者，源码包结构与文档治理的语义拥有者）。2026-10-16 PanQiWei 授权 AIEPhoenix 对本提案作出决定。「模板与检查器的归属」一节来自 #332 的分包决定，AIEPhoenix 同时是该范围的受影响拥有者。
- 决定日期及对应revision：2026-10-16，revision 1。决定者 AIEPhoenix，记录为 https://github.com/nemori-ai/omne-harness-lite/issues/352#issuecomment-6212688730 。
- 采用范围：本提案 revision 1 的全部条款，即取代 RFC-0003 revision 1 除「测试」一行以外的全部采用范围。随本决定一并采用：
  1. RFC 入口与 RFC 模板增加 `superseded` 状态与 `supersededBy` 字段，只用于整篇取代；部分取代继续只记后继关系表；原接受记录不变。
  2. RFC-0003 的方案与决定范围恢复为接受原文 `a50bcb0b`，加更正标注。
  3. 验收锁：只含 `<!-- documentation:placeholder -->` 占位、未写入场景的 `acceptance/` 入口文件不计为验收改动。
- 不采用范围及必要理由（沿用接受原文）：不建立全部目标目录，不搬迁 legacy，不实施 RFC-0002 的工具升级，不把根上的模板目录当作第二份结构。
- 未决与依赖停止点：
  1. **存储成员的包名。** 裁定者 PanQiWei。（沿用）
  2. **依赖层数上限。** 与 RFC-0002 的未决是同一项。（沿用）
  3. **发布范围。** 接受原文规定只发布 `dist`；现行模板说明写 `SPEC.md`、`schema/` 与 `resources/` 经显式文件列表发布。两者冲突，本提案不裁定。裁定者 PanQiWei。
  4. **新模板的版本号与现有成员的迁移时点。** 工具拥有者 AIEPhoenix 提出，PanQiWei 决定。

## 写回现行正文

| 采用条款范围 | 规范拥有者与目标源 | 写回定位状态 | 切换或解除依据及确认者 |
| --- | --- | --- | --- |
| 成员定义、成员规则、`package.json` 形状（沿用） | [包组织](../package-organization.md#成员的必选结构) | 已写回 | 指 RFC-0003 revision 1 的写回事实；本提案不改变含义 |
| 源码条件名、包名作用域、类型检查入口（修改） | [包组织](../package-organization.md#成员的必选结构) | 已写回 | RFC-0002 与 #310 实施时写回 |
| 首批候选现状、模板与检查器的归属、已知缺口（修改） | [包组织](../package-organization.md#现有成员与工具适配)、[workspace](../workspace.md) | 已写回 | #332 实施时写回 |
| 同上，指南中的残余旧说法 | [开发指南](../development.md#创建和整改产品包)及其他引用 `tools/ts-checks` 的正文 | 已写回 | #358，2026-10-16：删去“仍限制core”，模板说明的链接文字改为 repo-toolchain |
| RFC 修订与后继关系、取代状态 | [RFC-0003](RFC-0003-source-packages.md) 的状态、后继关系表与更正标注；[RFC入口](README.md)规则、导航与[RFC模板](.templates/rfc.md) | 已写回 | 2026-10-16 随本提案入库 |
| 完整生成树、每目录入口、专题职责（新增） | [包组织](../package-organization.md)「成员的必选结构」与「文档归属与维护路径」 | 已写回 | #358，2026-10-16 |
| 成员文档要求、占位与完成 | [成员文档](../member-documentation.md)「成员包文档要求」「行为契约与完整文档」「按需专题与持续资源」「阅读与维护路径」「检查与结论边界」 | 已写回 | #358，2026-10-16：新增「固定骨架」「专题职责」「目录入口」「占位与完成」，改写「按需专题与持续资源」 |
| 固定文件的创建义务与按需另文的范围 | [文档治理](../engineering/documentation.md)「最低内容与维护」及两层成员文档相关要求 | 已写回 | #358，2026-10-16 |
| README 与 index 分工、拆页与登记 | [维护指南](../maintenance.md)「控制内容粒度」「新增正文与拆页」「登记目标与留空」 | 已写回 | #358，2026-10-16 |
| 建包与整改操作 | [开发指南](../development.md)「创建和整改产品包」「终态与过程材料」 | 已写回 | #358，2026-10-16，与模板 3.0.0 同时切换 |
| 模板使用说明 | [包模板中文说明](../../tools/dev-flow/templates/package/README_ZH.md)与[英文说明](../../tools/dev-flow/templates/package/README.md) | 已写回 | #358，2026-10-16 |
| 登记与投影 | `docs/documentation.json`、受影响成员的 `documentation.json`、[知识地图](../knowledge-map.md)与[体系上下文](../knowledge-map-agent.md)及关联 SVG | 已写回 | #358，2026-10-16：`docs/documentation.json` 登记成员文档的四个新章节；新包的 `documentation.json` 由模板登记；知识地图、体系上下文与 SVG 逐句核对后无需改动；现有成员不迁移，其登记不变 |
| 验收目录的配置条件与验收锁 | [验证说明](../verification.md)、测试运行器与模板说明 | 已写回 | #358，2026-10-16：验收锁的占位例外随 `@omne-harness/repo-toolchain` 0.0.4 生效；测试运行器按 `acceptance` 脚本选成员，行为不变 |
| 测试责任 | [RFC-0005](RFC-0005-package-testing.md) 与[验证](../verification.md#包级测试责任与边界) | 不适用 | 由 RFC-0005 拥有 |

接受后由执行者继续梳理上表以外的真实消费者，交付时给出从已接受条款到现行文档、工具与消费者的同步清单。

## 后继关系与维护

| 后继提案或更正依据 | 部分或全部取代的精确范围 | 当前规范入口 |
| --- | --- | --- |
| 无 | 无 | 写回表所列的现行源 |

RFC-0003 已标为被本提案取代（`status: superseded`，`supersededBy: RFC-0007`），其后继关系表记录本提案；RFC-0005 对其「测试」一行的取代关系保持不变。检查器的发布、钉版本与工具链变更闸门不在本提案范围，由取代 RFC-0004 相应条款的另一份提案处理。
