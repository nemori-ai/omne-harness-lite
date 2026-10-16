# TypeScript 包模板

本目录拥有 `typescript-package@2.0.0`，是开发资源，不是 workspace 产品成员。公开接口、行为与接受继续归原拥有者。完整目录与版本说明见[英文说明](README.md)。成员的必选形状见[包组织](../../../../docs/package-organization.md#成员的必选结构)。本生成器已经写出先删除 `dist` 的 build、`erasableSyntaxOnly`，以及只发布 `dist` 的 `files`。源码条件名是 `source`，写在 `types` 前面。发布时去掉它。生成器写出 `tests/public-entry.spec.ts`，从包名核对当前公开导出。单元、契约、集成和端到端按[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)选择。只有实现具体存储或应用服务的包增加集成测试。只有关键旅程的拥有者增加端到端测试。

## 创建与完整结构核对

从仓库根运行：

```sh
pnpm package:template create --group identity --name authorization --variant service-contract
pnpm package:template create --group identity --name authorization --variant service-contract --write
pnpm package:template create --group access --name public-contract --variant module --write
pnpm package:template scan --json
pnpm package:template scan --member packages/identity/authorization --json
```

默认预览，`--write` 拒绝已有目标及软链接。先校验模板再写入；失败时清理自己创建的未完成包。不安装依赖、不运行包代码，用于没有并发目录替换的可信检出。

生成结果报告来源模板的 id/version/variant，**草稿不写采用标识**。占位带 PACKAGE_TEMPLATE_DRAFT，真实接口、已接受行为和有效验证完成后才可删除。不生成假 Service、空 SPEC 或伪通过测试。

成员发现先按 workspace 模式核对真实包目录和 manifest，再与源码成员清单对账。缺失或异常 manifest、目录软链接或非目录节点使扫描退出 2，不能把漏掉成员的空清单报告成通过。组根允许 README.md、README_ZH.md、AGENTS.md、CLAUDE.md 和 documentation.json。组 docs 中允许 Markdown 及明列的静态图格式，不算成员。未知子目录仍需真实包 manifest。docs 是保留文档目录名，不能创建同名成员。

结构判定遍历源码包的全部文件、目录、空目录及节点种类。按变体、明确可选资源与重复源码槽实例化模板，再核对完整节点集合。不是只看几个入口文件。未声明路径、错位文件、空目录、软链接及其他节点均失败；Git ignore 不能隐藏源码文件。

只排除根下明确声明的真实 node_modules、dist、generated、coverage、tmp 目录，并输出排除清单。同名文件或软链接不被跳过，嵌套目录没有这项豁免。构建/依赖/临时结果不作为源码权威。

## 归属与变体

| 路径或变体       | 职责                                                                |
| ---------------- | ------------------------------------------------------------------- |
| manifest.json    | 唯一当前版本、完整文件槽、必需项、变体和精确历史规则                |
| common/          | 包 manifest、共享构建/测试配置、双语 README 和 bindings v2 登记草稿 |
| module           | 独立函数、类型和值的纯根，不增加 Cordis 包装                        |
| cordis-module    | 纯根加集成 helper 或协调机制的绑定面                                |
| service-contract | 纯公共定义与 ./cordis 的 Service、唯一键和类型化事件                |
| service-provider | 独立工厂与 ./cordis 的具体绑定，消费公共承诺                        |
| fragments/       | 按实际义务取用的完整必要行为规格、Schema、模型/证明及 ADR 指南      |

变体由实际责任判断。私有 RowLifetime 之类的 helper 不自动使协调包变成公开 Service 提供者。不能凭目录名或一条 provide 抽取事实裁定。

Service 定义的归属沿[产品包组织](../../../../docs/package-organization.md)。目录名 `core` 不授予创建或扫描许可。
`scan --json` 的 `dependencies` 列出同一成员上已判断的边。一行包含 `rule`、`state`、`member`、`targetMember` 和 `sites`。
规则包含既有 IC 行、分层行、`undeclared-dependency` 和 `member-cycle`。
后两个名字不是 `RuleId`。它们不出现在 `constraints.json` 里。
`unknown` 保持 `unknown`。
`--check` 不把 `unknown` 当成通过。仅有 `unknown` 行时，退出码也不会变成 1。

分组方向是另一项检查，由 `pnpm run lint:deps` 的 dependency-cruiser 规则判，见 [ts-checks](../../../repo-toolchain/README_ZH.md#依赖图与依赖规则)。同组的 `sdk` 导入 `server-entry` 直接违反 `sdk-not-server`。

## 后续实施者

本模板提供草稿生成和依赖诊断。它不实现后续产品。

| 后续工作     | 使用方式                                                                                                                   | 本卡不提供                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 最小 CLI     | 应用不使用本模板。CLI 放在 `apps/`。命令解析不导入 `@deepseek-ai/cordis`。                                                 | 没有应用变体，也不实现命令循环。 |
| 成员测试设施 | 草稿包含 `tests/` 槽。隔离测试只证明官方模板生成的骨架能够 build 和 typecheck。                                            | 不建立分包测试平台。             |
| 基础能力     | `service-contract` 和 `cordis-module` 可以在目标组生成草稿。`kernel-basis` 的目标位置是 `packages/assembly/kernel-basis`。 | 不建立该成员，也不搬迁封存包。   |

## 依赖诊断

`scan --json` 的一行至少包含 `rule`、`state`、`member`、`targetMember` 和 `sites`。

类型导入没有声明依赖时，`rule` 是 `undeclared-dependency`，`state` 是 `deviation`。`reason` 是「源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明」。`tests/dependency-report.spec.ts` 断言这句。

经 `./cordis` 子路径和相对导入形成的环，`rule` 是 `member-cycle`，`state` 是 `deviation`。`reason` 以「成员之间成环」起头。同一测试断言这条形状。

`unknown` 保持 `unknown`。`--check` 退出 0 不表示全部依赖都已判断。

保留定义唯一性和公开入口。不要用手写结构或伪造采用标识绕过检查。

产品包基础必需 package.json、双语 README、documentation.json、构建/测试配置、src/index.ts，以及有真实内容的 src/ 和 tests/。绑定变体还需 src/cordis.ts 和已有采用依据的 SPEC.md。源码模块名和数量可变，但只在模板声明的 TypeScript 槽内变化。其他资源有实际义务才建：

- src/：实现、公开类型及实际校验；拆分 contract/types 模块仍由公开根导出，不另造一套 prose 权威。
- SPEC.md：拥有者的非类型行为。多提供者消费公共承诺，自己的规格只补资源、配置、失败等实际责任。
- schema/：对外 JSON Schema，保留身份，显式发布。
- resources/：运行数据及带来源/许可证的第三方工件，如 tokenizer；不混在源码或测试输入里。
- tests/fixtures/：测试输入，不能替代现行业务规格。
- verification/models/：TLA+、Alloy 或算法模型与配置；verification/proofs/：论证或机器证明。verification/README.md 必须说明性质、前提、命令、范围与证据拥有者。
- adr/：仍有消费者的实现取舍，使用小写目录。
- acceptance/：独立验收拥有者的场景，必须配 vitest.acceptance.config.ts；examples/：真实使用示例。

完整允许格式和位置以 manifest 为准。资源迁移同步实际读取、导航、打包和验证；不改变业务语义、Schema 身份、输入字节或旧接受坐标。仍有效的未迁源在消费者与证据接续前继续约束原实现，不能借模板迁移删掉。

## 标识与人工采用门

全部结构适配及适用集成责任核对完成后，才在 package.json 写 omneHarness.packageTemplate 的 id/version/variant。生成草稿、未完成资源、未核对提供者及已知偏离包不贴标。[1.0.0采用核对记录](adoption-review.md)只说明旧版采用范围，不授予2.0.0采用状态，也不是第二份契约或版本登记源。

扫描分别报告标识 current/older/unmarked/invalid/unknown、完整结构 pass/fail/uncovered，以及集成 deviation/unknown/static-pass。静态 unknown 不自动判成偏离，也不能当符合证据；人工沿适用条款与原证据核对。目录全等不证明租户、事务、实际排空、恢复或形式性质。

普通盘点退出 0 只表示报告完成。--check 的 0 表示当前标识、完整结构通过且无已知静态集成偏离；缺标识、旧版、结构失败或偏离退出 1；无精确规则或输入错误退出 2。集成 unknown 仍显示，0 不代表全部集成或业务验收。扫描不写文件、不自动采用或升级。

2.0.0新增必需 documentation.json 和条件文档槽。previousVersions 准确保留1.0.0的必需文件、变体与完整布局。旧marker仍报告older，不自动增加登记义务。历史规则必须完整保留必需文件、变体要求、全量结构和固定 ruleSet 2 语义；缺规则报 uncovered，不能套当前规则认证。已撤回的早期有限检查不是发布过的历史模板。

## 文档与能力组草稿

[两层文档要求](../../../../docs/member-documentation.md)拥有必需内容。双语包README分别覆盖七个必要栏目，每个栏目保留独立占位标记。登记复用bindings v2，使用根相对路径和稳定章节ID。basis=adopted只表示结构要求已有依据，不表示草稿正文被接受。

[组模板](../domain/README.md)只生成README.md和documentation.json，不创建workspace成员、源码、空专题或采用标识。

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --json --check
uv run --locked omne-documentation inventory --root . --out tmp/documentation-inventory
```

fragments/docs按实际阅读任务取用，默认不复制。专题承担必要内容时登记其文件和章节。docs只允许Markdown、SVG、PNG和WebP，空目录与其他格式失败。所有模板登记只存.json.tpl，避免被默认inventory发现为实例。

TS核对布局、登记存在和草稿sentinel。Python核对bindings v2、依据、章节、占位和适用未知。章节占位报告missing-section，reason为`section body: placeholder-only`。inventory退出0只表示报告完成，必须读取具体状态。

无选择器扫描同时列组的当前模板读数，仍沿包的既有退出策略。显式--group配合--check才断言组结构，不能同时使用--member。组结果列template身份、节点、委派成员、缺项及current-template-only范围，不认证历史采用。未整改旧组和旧版成员须单独说明新要求的覆盖范围。

模板通过不证明正文充分、独立安装或业务行为，也不授予语义接受。局部登记缺失由模板检查报告，不能把inventory未发现当作完整。

## 长期规格与单次交付输入

[行为规格指南](fragments/specification/SPEC.md.tpl)覆盖本成员拥有的结果、不变量、失败、生命周期、组合及持续验证。[技术设计模板](fragments/docs/internals.md.tpl)说明兑现承诺的机制、责任、失败结算及必要理由。公开形状仍归公开入口，共同保证不复制到每个提供者。规格不设“薄”或固定篇幅限制，按责任表达完整必要内容。

单次交付规格组织一次任务的实施范围及验收输入，留任务过程材料；交付Issue引用当前规范和所核修订，不替代长期SPEC或技术设计。二者的关系和决定规则归[交付协议](../../../../docs/engineering/delivery.md)。

真实技术提案进入[RFC区](../../../../docs/rfcs/README.md)。提案采用、规范写回、实现和交付接受分别判断；当前SPEC独立表达最终采用保证，不要求读者拼接RFC历史，不为首次正式规格补造提案。

这些写作指南不增加必需文件、结构槽或历史采用义务；manifest版本与历史规则保持原身份。
