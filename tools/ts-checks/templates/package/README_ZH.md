# TypeScript 包模板

本目录拥有建包骨架及 `typescript-package@1.0.0` 结构规则。它是开发资源，不是 workspace 产品成员。公开接口、薄规格及已接受行为继续由原拥有者维护。完整目录说明和版本规则见[英文说明](README.md)。

## 创建与扫描

先定位已接受的接口、行为及实现责任，再从仓库根运行：

```sh
pnpm package:template create --group core --name example-capability --variant service-contract
pnpm package:template create --group core --name example-capability --variant service-contract --write
pnpm package:template scan --json
pnpm package:template scan --member packages/core/storage --check
```

默认只预览文件清单。`--write` 拒绝已有目标及软链接，不安装依赖、不执行包代码。写入前验证全部模板，写入失败清理自己创建的未完成包。它用于可信本地检出，不承诺抵御并发恶意目录替换。

生成物带 `PACKAGE_TEMPLATE_DRAFT`，扫描会拒绝这些草稿。完成真实公开接口、已接受行为及有意义的验证后，才能删除占位。不要建立假 Service、空 spec 或伪业务测试来让检查通过。

## 目录归属

| 路径 | 用途 |
| --- | --- |
| manifest.json | 模板身份、精确版本、公共文件、变体及历史规则索引 |
| common/ | package.json、构建／测试配置和双语 README 草稿 |
| variants/module/ | 纯函数或数据模块的公开根 |
| variants/cordis-module/ | 纯根加绑定面，用于不定义公共 Service 的内核辅助或组合机制 |
| variants/service-contract/ | 纯公共定义和独立 ./cordis 的 Service、键及事件，定义包归 core |
| variants/service-provider/ | 独立工厂与 ./cordis 提供者，消费公共定义而非复制定义 |
| fragments/ | 按实际义务选用的薄规格、Schema、验证及 ADR 写作指南 |

产品包源码归 src/，公开根为 src/index.ts，绑定面为 src/cordis.ts。需要拆分公共类型时放 src/contracts/ 并从根导出。类型之外的行为归模块根 SPEC.md，不重复类型字段。外部消费者需要的 Schema 放 schema/，保留稳定身份并显式导出。内部校验留在 src/。测试归 tests/，形式或算法模型归 verification/models/，连同配置、前提、正负控和运行命令维护。仍有消费者的实现取舍归 ADR/。这些可选目录不能预填空材料。

## 现存包与版本

现存包先扫描，逐包核对公开能力、结构和绑定归属，补齐实际缺项后才加入 package.json 的 omneHarness.packageTemplate 标识。标识含 id、version、variant，示例见英文说明。打包文件清单包含双语 README，保留原 exports、依赖、源码、模型及语义。已知静态偏离不贴合规标识。

扫描分别报告采用状态和结构结果。current、older、unmarked、invalid、unknown 不等于通过或失败。结构为 pass、fail、uncovered。既有静态偏离参与失败判断；架构角色或动态绑定 unknown 单独展示，不能把它们算成已验证。标识不证明租户、事务、生命周期或形式性质。

普通盘点完整执行后退出 0，但会显示失败和未覆盖。--check 只在当前版本且结构通过时退出 0；未标记、旧版或结构失败退出 1；无精确规则或输入错误退出 2。扫描只读，不自动升级标识。

首版没有真实历史模板，previousVersions 为空。受控旧版夹具只验证分支机制，不证明历史迁移。历史版本必须绑定完整且不可变的规则修订；无规则报 uncovered，不能套用当前规则认证。模板义务变化时更新版本，已采用包保持旧标识直至核对迁移。
