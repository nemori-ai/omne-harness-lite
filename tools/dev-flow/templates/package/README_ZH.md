# TypeScript 包模板

本目录拥有 `typescript-package@4.0.0`，是开发资源，不是 workspace 产品成员。公开接口、行为与接受继续归原拥有者。成员的必选形状见[包组织](../../../../docs/package-organization.md#成员的必选结构)。英文说明见 [README.md](README.md)。

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

生成结果报告来源模板的 id/version/variant，**草稿不写采用标识**。`src/index.ts` 与 `src/cordis.ts` 带 PACKAGE_TEMPLATE_DRAFT，真实接口、已接受行为和有效验证完成后才可删除。不生成假 Service 或伪通过测试。

## 生成的文件

生成六个文件，绑定变体另有两个。不生成 Markdown，也不生成文档登记。

```text
packages/<group>/<name>/
├── package.json
├── tsconfig.build.json
├── tsconfig.test.json
├── vitest.config.ts
├── src/index.ts                 绑定变体另有 src/cordis.ts
└── tests/public-entry.spec.ts   绑定变体另有 tests/cordis-entry.spec.ts
```

生成的 `package.json` 有先删除 `dist` 的 build、写在 `types` 前面的 `source` 条件、只发布 `dist` 的 `files`，以及 `test`、`test:fast`、`test:slow` 三个测试脚本，层由 vitest 的 mode 选择。它们不构建：在仓库根运行 `pnpm turbo run test --filter=<包名>`，turbo 先构建本成员及其依赖。`tsconfig.build.json` 设 `erasableSyntaxOnly`。发布时去掉 `source`。
`tests/public-entry.spec.ts` 从包名核对当前公开导出。单元、契约、集成和端到端按[包级测试责任与边界](../../../../docs/verification.md#包级测试责任与边界)选择。只有实现具体存储或应用服务的包增加集成测试，只有关键旅程的拥有者增加端到端测试。

## 归属与变体

| 路径或变体       | 职责                                                 |
| ---------------- | ---------------------------------------------------- |
| manifest.json    | 唯一当前版本、完整文件槽、必需项、变体和精确历史规则 |
| common/          | 包 manifest、共享构建/测试配置与入口测试             |
| module           | 独立函数、类型和值的纯根，不增加 Cordis 包装         |
| cordis-module    | 纯根加集成 helper 或协调机制的绑定面                 |
| service-contract | 纯公共定义与 ./cordis 的 Service、唯一键和类型化事件 |
| service-provider | 独立工厂与 ./cordis 的具体绑定，消费公共承诺         |

变体由实际责任判断。私有 RowLifetime 之类的 helper 不自动使协调包变成公开 Service 提供者。不能凭目录名或一条 provide 抽取事实裁定。

Service 定义的归属沿[产品包组织](../../../../docs/package-organization.md)。目录名 `core` 不授予创建或扫描许可。

## 完整结构核对

成员发现先按 workspace 模式核对真实包目录和 manifest，再与源码成员清单对账。缺失或异常 manifest、目录软链接或非目录节点使扫描退出 2，不能把漏掉成员的空清单报告成通过。组根在当前组模板下允许 SPEC.md、AGENTS.md 和 CLAUDE.md，旧规则下的组按旧规则。组 docs 不算成员。未知子目录仍需真实包 manifest。docs 是保留文档目录名，不能创建同名成员。

结构判定遍历源码包的全部文件、目录、空目录及节点种类，与 manifest 声明的变体布局核对完整节点集合，不是只看几个入口文件。未声明路径、错位文件、空目录、软链接及其他节点均失败；Git ignore 不能隐藏源码文件。

4.0.0 只允许这几份 Markdown：成员根的可选 `README.md`、`UPSTREAM.md` 与 `api/*.api.md`。不允许 `docs/`、`adr/`、`SPEC.md`、`AGENTS.md`、`CLAUDE.md`、`README_ZH.md`、`index.md`、`documentation.json`，也不允许任何子目录里的 `README.md` 与 `index.md`。
源码模块名和数量可变，但只在模板声明的 TypeScript 槽内变化。Schema、运行资源、模型、证明与夹具必须在声明的位置和格式内。

验收配置跟随可执行场景，不跟随目录。`acceptance/` 下（不含 `acceptance/fixtures/`）有 `*.acceptance.ts` 时，必须有 `vitest.acceptance.config.ts` 与 `package.json` 的 `acceptance` 脚本；有配置时必须有场景。违反时报 `acceptance`。只有入口文件时不要求配置，扫描结果的 `acceptance` 读作 `none`。

契约成员由 `contract:api --write` 生成的 `api/*.api.md` 属于允许的可选槽。模板不预建空 `api/` 目录，也不接受该目录下的普通说明或源码。

只排除根下明确声明的真实 node_modules、dist、generated、coverage、tmp、.turbo 目录，并输出排除清单。同名文件或软链接不被跳过，嵌套目录没有这项豁免。同时核对 ESM、导出源与条件、产物、发布、脚本及草稿占位。

集成结果另列：deviation、unknown 或 static-pass。现有架构抽取器提供事实，覆盖限制保持明示。完整文件树不证明租户、事务、实际排空、恢复或形式性质。已知集成偏离禁止采用；unknown 须人工核对适用性与证据，不自动放行。

## 后续实施者

本模板提供草稿生成和依赖诊断。它不实现后续产品。

| 后续工作     | 使用方式                                                                                                                   | 本卡不提供                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 最小 CLI     | 应用不使用本模板。CLI 放在 `apps/`。命令解析不导入 `@deepseek-ai/cordis`。                                                 | 没有应用变体，也不实现命令循环。 |
| 成员测试设施 | 草稿包含 `tests/` 槽。隔离测试只证明官方模板生成的骨架能够 build 和 typecheck。                                            | 不建立分包测试平台。             |
| 基础能力     | `service-contract` 和 `cordis-module` 可以在目标组生成草稿。`kernel-basis` 的目标位置是 `packages/assembly/kernel-basis`。 | 不建立该成员，也不搬迁封存包。   |

## 依赖诊断

`scan --json` 的 `dependencies` 列出同一成员上已判断的边。一行至少包含 `rule`、`state`、`member`、`targetMember` 和 `sites`。
规则包含既有 IC 行、分层行、`undeclared-dependency` 和 `member-cycle`。后两个名字不是 `RuleId`，不出现在 `constraints.json` 里。
`unknown` 保持 `unknown`。`--check` 不把 `unknown` 当成通过，仅有 `unknown` 行时退出码也不会变成 1。

类型导入没有声明依赖时，`rule` 是 `undeclared-dependency`，`state` 是 `deviation`。`reason` 是「源码引用 workspace 包但未在 dependencies、peerDependencies 或 devDependencies 声明」。`tests/dependency-report.spec.ts` 断言这句。
经 `./cordis` 子路径和相对导入形成的环，`rule` 是 `member-cycle`，`state` 是 `deviation`。`reason` 以「成员之间成环」起头。同一测试断言这条形状。

分组方向是另一项检查，由 `pnpm run lint:deps` 的 dependency-cruiser 规则判，见 [repo-toolchain](../../../repo-toolchain/README_ZH.md#依赖图与依赖规则)。同组的 `sdk` 导入 `server-entry` 直接违反 `sdk-not-server`。

保留定义唯一性和公开入口。不要用手写结构或伪造采用标识绕过检查。

## 标识与人工采用门

全部结构适配及适用集成责任核对完成后，才在 package.json 写 omneHarness.packageTemplate 的 id/version/variant。生成草稿、未完成资源、未核对提供者及已知偏离包不贴标。[1.0.0采用核对记录](adoption-review.md)只说明旧版采用范围，不授予后续版本的采用状态，也不是第二份契约或版本登记源。

扫描分别报告标识 current/older/unmarked/invalid/unknown、完整结构 pass/fail/uncovered，以及集成 deviation/unknown/static-pass。静态 unknown 不自动判成偏离，也不能当符合证据；人工沿适用条款与原证据核对。

普通盘点退出 0 只表示报告完成。--check 的 0 表示当前标识、完整结构通过且无已知静态集成偏离；缺标识、旧版、结构失败或偏离退出 1；无精确规则或输入错误退出 2。集成 unknown 仍显示，0 不代表全部集成或业务验收。扫描不写文件、不自动采用或升级。

## 版本规则

manifest 是唯一当前版本源；已发布模板义务变化时才改版本。已有包保持已采用版本，直到完整迁移核对通过。未知身份与未来版本不能用当前规则认证。

previousVersions 准确保留 3.0.0、2.0.0 与 1.0.0 的必需文件、变体与完整布局，标着旧版本的成员按它自己版本的规则扫描。
3.0.0 的规则集是 ruleSet 3：完整文档骨架、docs 专题二选一（`docs/<topic>.md`，或带 `README.md` 与 `index.md` 的 `docs/<topic>/`，二者不并存），以及按场景判定的验收配置。
2.0.0 与 1.0.0 是 ruleSet 2：不检查专题，`acceptance/` 与 `vitest.acceptance.config.ts` 互相要求。2.0.0 新增必需 documentation.json。
4.0.0 是 ruleSet 4：去掉文档骨架、专题与登记，保留验收规则。
旧 marker 仍报告 older，不自动增加新义务。历史规则必须完整保留必需文件、变体要求、全量结构和固定规则集语义；缺规则报 uncovered，不能套当前规则认证。

## 组模板

[组模板](../domain/README.md)每个组只生成一份 `SPEC.md`，不创建 workspace 成员、源码、空专题或采用标识。

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --check --json
```

无选择器扫描同时列组的读数，仍沿包的既有退出策略。显式 --group 配合 --check 才断言组结构，不能同时使用 --member。组结果列 template 身份、节点、委派成员及缺项，不认证组的采用。
