# W1 第 1 轮评审：结构读数（摘要）

lint:deps 两边退出 0，无依赖违规、无成员环；组环 agent/context/execution/tool 按例外放行，基线既有。覆盖率两边 98%。

## Skill（超线函数）
- `interpret` CC 21：拆——抽 `boundedText(value, max)`（description 与 compatibility 共用）与 `manifestOf(name, fields)`。
- `convert` CC 13：拆——抽 `sequence(...)`、`mapping(...)`，主函数只留别名展开、预算、深度与四路分派。
- `parseSkillPackage` CC 12：保留，拒绝顺序本身是契约；可选抽 `nameMismatch`。
- `describeSkillResolutionConformance` CC 13：保留（内层回调分支算到外层）。
- `frontmatterOf` CC 10：保留；观察 `for` 条件 `start <= text.length` 可能不自退，末尾 `return undefined` 走不到（覆盖 90%），实施者核实后改 `for(;;)` 或注释。
- 包内重复（工具未报）：`contract.ts:86` 与 `parse/manifest.ts:22` 各定义一次 `DESCRIPTION_MAX = 1024` 并各做一次 1..1024 码点检查——合到 `parse/shape.ts`。
- 跨包克隆：与 tool-contract 的 25 行（`stringField`/`field`/`isObject`，通用 read-body 读取器）只能放进 assets，范围外，登记清理候选；14 行（judge/references 开头）保留，平行实现合理。

## MCP（超线函数）
- `deliveredItem` CC 15：拆——按 type 的读取表 `READERS` 与 `PROTOCOL_DEFECT` 表，去掉四层嵌套三元。
- `launchOf` CC 13：拆——抽 `facilitiesOf`（与 `environmentOf` 对称）与 `optionalNonEmptyText`。
- `parseEndpointBody` CC 16：轻拆——抽 `transportOf(transport, launch)` 的四格决定；拒绝顺序留主函数。
- `actionDefinitionOf` CC 11：保留。
- 克隆一条是 stryker 沙箱噪声；「无断言用例」是误报（断言在套件内部）。
