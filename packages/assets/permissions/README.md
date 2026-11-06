# permissions

## 职责与状态

`@omne-harness/permissions` 提供权限声明校验、Settings 投影和固定材料的纯规则求值。采用依据是用户于 2026-11-06 验收的 [HJ0 治理贡献协议](../docs/governance-contributions.md)与[权限组合协议](../../human-intervention/human-intervention/docs/permission-composition.md)。[SPEC](SPEC.md)维护业务规则，[公开源码](src/index.ts)维护精确类型。

当前实现是 C3a。动态注册、持有资格、Settings 受保护提交、采用围栏和 Runtime Context 接线属于后续组合交付。纯函数通过不表示整个 C3 已完成，也不表示动作已获准或执行成功。

## 使用与集成

从包入口调用 `definePermission(input)`、`projectPermissionSettings(input)` 和 `evaluatePermission(input)`。三个函数都接收 `unknown`，拒绝多余字段和无效绑定。声明支持资产来源和独立服务来源，普通 key 不授予能力。

`definePermission` 返回已复制并深度冻结的声明。`projectPermissionSettings` 返回既有 `SettingDefinitions` 形状，以及含值标签、scope 说明和批准后果的权限声明。无持久配值的声明返回 `not-configurable`。

`evaluatePermission` 消费已由调用方核验的材料。结果为 `effective`、`denied`、`unavailable` 或 `invalid-input`。`effective.permitsOperation` 仍可能为 false；`effective` 只表示有效值已求出。结果中的 scope、具体定义引用、能力关口和 revisionVector 供集成方固定依据及后续重核。

可运行的完整用例在 [public-entry.spec.ts](tests/public-entry.spec.ts)，输入在 [fixtures.ts](tests/fixtures.ts)。[公开协议](docs/public-api.md)说明来源绑定、比较矩阵、Settings 配值表示和后续接线责任。

## 契约与设计

默认、组织、租户、会话是四个配值层。锁界取交集，未锁值仅作挑选。额外约束是具名外域上界或禁止，不是第五层。组织、租户、会话主动选择不允许操作时，内层挑选无法覆盖。作者默认不允许仍只是默认挑选。

同 key 的具体来源配值不迁移。独立的能力约束在替换或声明缺失时继续生效；不能可靠匹配时返回不可用或无效输入。不存在工作区配值槽。工作区具名类别的保守限制由可信约束提供者交入。

[内部设计](docs/internals.md)包含长期组合流程与当前纯规则实现的区别。权限包不持有 Cordis fiber，不保存配值，不建立第二个 Settings 注册表。

## 配置与运行

运行环境为 Node.js 24 及以上。依赖现有 `@omne-harness/settings` 和锁定版本的 zod。调用方须提供当前合法材料，纯函数不读取数据库、文件、时钟或服务。结构校验不能证明调用方身份、真实关口、租户资格或来源当前性。

## 验证与维护

在本成员目录运行 `pnpm run build`、`pnpm run typecheck` 和 `pnpm exec vitest run --mode fast`。测试通过公开包入口消费 dist，因此修改源码后先构建。

独立关系检查在仓库根运行 `node packages/assets/permissions/verification/check-oracle.mjs`。它直接使用 HJ0 Python 关系 oracle，对生产 dist 检查 425,985 个有限案例；需要 Python 3.10 及以上，默认命令为 `python3.12`，可用 `PYTHON` 指定解释器。映射和证据边界见[验证说明](verification/README.md)。

单元与关系检查不覆盖 SQL 提交、声明注册权、撤除并发、进程恢复或真实执行关口。独立 review、QA 与最终接受由交付负责人组织。
