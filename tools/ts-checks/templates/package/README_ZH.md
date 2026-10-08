# TypeScript 包模板

本目录拥有 `typescript-package@1.0.0`，是开发资源，不是 workspace 产品成员。公开接口、行为与接受继续归原拥有者。完整目录与版本说明见[英文说明](README.md)。

## 创建与完整结构核对

从仓库根运行：

```sh
pnpm package:template create --group core --name example-capability --variant service-contract
pnpm package:template create --group core --name example-capability --variant service-contract --write
pnpm package:template scan --json
pnpm package:template scan --member packages/core/storage --check
```

默认预览，`--write` 拒绝已有目标及软链接。先校验模板再写入；失败时清理自己创建的未完成包。不安装依赖、不运行包代码，用于没有并发目录替换的可信检出。

生成结果报告来源模板的 id/version/variant，**草稿不写采用标识**。占位带 PACKAGE_TEMPLATE_DRAFT，真实接口、已接受行为和有效验证完成后才可删除。不生成假 Service、空 SPEC 或伪通过测试。

成员发现先按 workspace 模式核对真实包目录和 manifest，再与源码成员清单对账。缺失或异常 manifest、目录软链接或非目录节点使扫描退出 2，不能把漏掉成员的空清单报告成通过。组目录只允许 README.md、README_ZH.md、AGENTS.md、CLAUDE.md 作为非目录导航文件。

结构判定遍历源码包的全部文件、目录、空目录及节点种类。按变体、明确可选资源与重复源码槽实例化模板，再核对完整节点集合。不是只看几个入口文件。未声明路径、错位文件、空目录、软链接及其他节点均失败；Git ignore 不能隐藏源码文件。

只排除根下明确声明的真实 node_modules、dist、generated、coverage、tmp 目录，并输出排除清单。同名文件或软链接不被跳过，嵌套目录没有这项豁免。构建/依赖/临时结果不作为源码权威。

## 归属与变体

| 路径或变体 | 职责 |
| --- | --- |
| manifest.json | 唯一当前版本、完整文件槽、必需项、变体和精确历史规则 |
| common/ | 包 manifest、共享构建/测试配置和双语 README 草稿 |
| module | 独立函数、类型和值的纯根，不增加 Cordis 包装 |
| cordis-module | 纯根加集成 helper 或协调机制的绑定面 |
| service-contract | 纯公共定义与 ./cordis 的 Service、唯一键和类型化事件；定义归 core |
| service-provider | 独立工厂与 ./cordis 的具体绑定，消费公共承诺 |
| fragments/ | 按实际义务取用的薄规格、Schema、模型/证明及 ADR 指南 |

变体由实际责任判断。私有 RowLifetime 之类的 helper 不自动使协调包变成公开 Service 提供者。不能凭目录名或一条 provide 抽取事实裁定。

产品包基础必需 package.json、双语 README、构建/测试配置、src/index.ts，以及有真实内容的 src/ 和 tests/。绑定变体还需 src/cordis.ts 和已有采用依据的 SPEC.md。源码模块名和数量可变，但只在模板声明的 TypeScript 槽内变化。其他资源有实际义务才建：

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

全部结构适配及适用集成责任核对完成后，才在 package.json 写 omneHarness.packageTemplate 的 id/version/variant。生成草稿、未完成资源、未核对提供者及已知偏离包不贴标。逐包结论与剩余范围见[采用核对记录](adoption-review.md)。记录不是第二份契约或版本登记源。

扫描分别报告标识 current/older/unmarked/invalid/unknown、完整结构 pass/fail/uncovered，以及集成 deviation/unknown/static-pass。静态 unknown 不自动判成偏离，也不能当符合证据；人工沿适用条款与原证据核对。目录全等不证明租户、事务、实际排空、恢复或形式性质。

普通盘点退出 0 只表示报告完成。--check 的 0 表示当前标识、完整结构通过且无已知静态集成偏离；缺标识、旧版、结构失败或偏离退出 1；无精确规则或输入错误退出 2。集成 unknown 仍显示，0 不代表全部集成或业务验收。扫描不写文件、不自动采用或升级。

首版 previousVersions 为空，没有真实历史版本。受控夹具只核历史分支，不制造正式旧版迁移。历史规则必须完整保留必需文件、变体要求、全量结构和固定 ruleSet 2 语义；缺规则报 uncovered，不能套当前规则认证。已撤回的早期有限检查不是发布过的历史模板。
