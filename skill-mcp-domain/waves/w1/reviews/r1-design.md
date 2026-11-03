# W1 第 1 轮评审：设计与实践（摘要）

两边无阻断；最大的问题是两成员之间的形态分裂，且分裂在两份波规格里就定下了。

## Skill
- 应修：`./testing` 运行时导入 vitest（devDependency，三个 testing-*.ts）；变红验证只能起子进程跑 vitest（`conformance-red.spec.ts` 用 spawnSync 切 JSON），统一形态后可删；`SkillPackageSource` 套件与内存替身都不看 `open` 的 `digest` 参数，真实目录来源在快照后被改仍能全过——需补用例，但 SPEC 第 228 行没写收到非当前 digest 答什么。
- 建议：`snapshot.ts:81-82` 有走不到的分支（`sealed.add` 后 `if (!isSealed) throw`），`SnapshotFields`/`isSealed` 只为它存在；校验靠可变 `findings` 数组出参传递（`parse/shape.ts`），可改为返回 `{value, findings}`；`toSkillName`/`toSafeReason`/`toAssetVersion`/`toPackageDigest` 失败码只有一个，用 Outcome 比布尔守卫多不出信息；`parse-package.spec.ts` 551 行可按拒绝原因拆。

## MCP
- 应修：伪造的 `CompleteListing` 被当成领域拒绝 `not-complete` 返回，Skill 对同类情况抛 TypeError，两成员语义不一；套件叫 `describe*Conformance` 却返回 `ConformanceCase[]`（先例叫 `tool<Port>Conformance()`）；`testing-case.ts` 重写先例子集，少了 `runConformanceCase`、`isNotApplicable`。
- 建议：`./testing` 导出本成员自己纯函数的样本表扩大了公开面；`completeListing` 只浅冻结（`actions` 数组可追加）；八个品牌守卫只检查非空字符串（名义区分，SPEC 写明即可）；`./provider` 重复导出根已有的 `AuthorizationDiscovery`、`BlockedReason`。

## 两成员一致性（应修）
1. 符合性套件统一到 tool-contract 形态：返回 `ConformanceCase<F>[]` + `node:assert`；命名 `<ctx><Port>Conformance()`；每用例一份新 fixture 工厂；两份波规格第 87/89 行同步改。
2. 品牌授予规则：只做检查的值公开 `isX(value: unknown)`；只有会变换输入（`toPackagePath` 去 `.` 段）或失败原因多于一个时才公开 `toX → Outcome`。Skill 的四个 `toX` 改为公开 `isX`。
3. 「只能由构造器造出」统一：品牌类型 + 模块私有 WeakSet + 一个登记并收窄的私有守卫；伪造一律抛 TypeError；冻结到集合层；去掉走不到的分支。WeakSet 必要（展开复制能过类型检查），代价要写进 SPEC：进程内凭证不可传输；模块级状态在双份加载时互不承认。
4. 判定类答复统一成带 `kind` 的判别联合（Skill `ReadVerdict` 是字符串联合）。
5. JSON 树小工具、SHA-256 加品牌写法两边各一份；`./provider` 放不放运行时构造器两边不同，组页应写一条规则。

## 范围外
- `ConformanceCase`/`NotApplicable`/`runConformanceCase` 在 tool-contract、mcp-contract 各一份，Skill 统一后第三份；是否进公共成员。
- 能力名词法与 sha256 值规则两成员各写一份；是否归 assets 或公共值成员。
- Skill 结构扫描在评审者环境退出 2（product discovery 不一致），未验证。
