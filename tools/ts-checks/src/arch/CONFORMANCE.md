# 全局架构符合性报告

形状由 conformance-model.ts 拥有，输入校验由 constraints.ts 拥有。本页约束报告行为。
依据：已授权 N3、D-114 的有效 IC、[系统分层](../../../../docs/architecture/layers-and-dependencies.md)。

## 输入与责任

当前唯一输入为 `docs/architecture/constraints.json`。HEAD和BASE各自按本版坐标发现输入，历史版仍可读取旧 `.meta_harness/design/architecture/constraints.json`。同一版本存在两份输入时拒绝，即使字节相同。规则身份仅取公开RULE_IDS。
domains 和 roles/rules 的身份分别唯一。入口路径为仓库相对路径，只接受精确路径或末尾 /**。
角色匹配优先最精确路径；同精度冲突、candidate、unknown 与未映射都不能作采用的层次证据。
空规则列表合法且不同于文件缺失。缺失以INPUT unknown保留坐标和原因，不能声称整体符合。未知规则、坏JSON、越界路径和重复身份必须失败。

schemaVersion 2的source是仓库根相对Markdown路径，可附锚点。历史schemaVersion 1保留具名根前缀与同目录相对形式；不通过搜索哪个文件存在来选择基准。每个source的文件及锚点都从输入相同版本读取，坏引用拒绝。工作树中的符号链接不能让读取越出检出；历史版只读取该commit中的普通文件。
全局输入与原有效 realization 例外分别保留拥有者，不复制插件绑定。

HEAD 与 BASE 分别读本版完整 workspace、源码、manifest 和解析配置。
抽取后的 Import occurrence 包含 resolvedPath；workspace 名称已识别但源码未解析不能作已解析入口。
规则结果身份包括规则、源入口、目标入口/未解析名称、符号和类型/引用形式，排除行号。
同包内两个入口不能共用一个违反规则身份。未知表达式继续携带位置和原因。

## 机械子集

机械规则沿[产品包组织](../../../../docs/package-organization.md)按采用责任、公开入口和源码闭包判断。core与util目录名不授予许可。存量candidate、unknown及未映射继续报告unknown，不因迁移提高采用状态。domains保留原机读分组投影，不代替完整领域清单，也不按目录数量重标。
| 身份 | 能判断的范围 | 不能据此证明 |
|---|---|---|
| LAYER-ENTRY | adopted 交互入口直接 import/export 业务存储契约或适配器，含类型引用 | 函数内部授权与间接调用的业务语义 |
| LAYER-DIP | adopted 策略入口引用 adopted 交互、存储适配或装配源码 | 外部库的所有语义与运行注入方向 |
| IC-1 | 同键多处定义；定义不属于已采用责任或未从真实exports公开 | 动态定义、运行提供者唯一性及完整契约拥有关系 |
| IC-2 | 已识别 ctx.provide 旧形状，不能替代 Service 子类规则 | 回收、并存及在途状态 |
| IC-3 | 定义是 Context 增补，或缺少 contract/owner | 签名/行为与契约完全一致 |
| IC-4 | manifest各根exports映射源码的闭包引入Cordis或本包集成入口；保留原kernel-basis与apps例外 | 声明、实际制品、安装闭包和动态非字面量 |
| IC-5 | 非装配消费者引用私有入口或已采用外侧实现；公开定义值闭包引入独立提供者；例外取BASE精确声明 | 声明、制品隔离、动态选择与同提交行为保证 |

IC-5的源或目标责任没有采用时是unknown。具体装配豁免只归已采用的源文件；目标同包公开服务定义可以消费，但其值闭包不得引入独立提供者。IC-3允许的定义自有登记逻辑不因此成为独立提供者。
尚不明确的例外不得当作符合。泛化存储契约即使满足 DIP，仍由 LAYER-ENTRY 判交互越界。
已接受 IC-5 例外与分层要求相冲突时，该分层结果为 unknown 并指出原例外出处，等待负责人裁定。
普通装配只豁免明确定位的源文件；没有 apps 通用分层豁免。
单条 converged 只表示该条有限静态检查没有发现违规，不表示成员或系统整体符合。

包扫描把上述符合性行原样投影到 `PackageScan.dependencies`。同一数组再加 `undeclared-dependency` 和 `member-cycle`。这两个名字不是 `RuleId`，不能写入 `constraints.json`，也不能靠省略规则关掉。`undeclared-dependency` 表示源码引用了另一个 workspace 成员，而 importer 的 `dependencies`、`peerDependencies` 或 `devDependencies` 没有该包名。类型导入同样需要声明。`member-cycle` 使用已解析的 workspace 导入，包括 `/cordis` 子路径，以及解析到其他成员的相对导入。`unknown` 不会被投影成 `converged`。IC-4 仍跳过 `apps/` 成员根和 `packages/core/kernel-basis` 的公开根闭包。该跳过不是对应用其他文件的 Cordis 禁令。

IC-6/9/10/11/13/14/16/18/19 及 LSP 保留行为义务；IC-7、SRP/OCP/ISP 留人工判断；
IC-8和IC-12尚未接入机械规则。IC-15和IC-16的加载器已由实际成员交付，本静态规则尚未覆盖最终配置与来源，仍须核对实际组合证据。IC-17机制待设计。
这些状态须在 JSON、浏览器与 health 中保留。类型同形反例须显示无静态 LSP 证明。

## 比较与反馈

给出BASE时，当前实现对BASE规则及精确例外比较。BASE输入缺失时，依赖该输入的结果是unknown或no-data，不用HEAD或空规则替代。删除当前输入仍保留语义删除和INPUT unknown；开启的architecture传感器因此为no-data。独立实际事实差分仍可报告。
未给 BASE 时使用当前预期，comparedWith=current；结果的新旧分类为 unjudged，预期变化不比较。
BASE 实现对 BASE 预期构成存量；新违规与存量分别表示。无 BASE 时分类未判。
HEAD 和 BASE 的全局预期及原节点预期变化单列。删除最后规则或整个文件也保留变化。
JSON格式、行号和集合排序不造成预期变更；路径、角色状态、依据、规则或例外变化属于语义变化。
每版输入携带source文件的SHA256。sourceChanges独立报告依据路径及字节变化，不并入changes或architectureChanges语义计数；它不证明含义变化。JSON、HTML和hook显示两类变化，所有摘要仍保留未知范围。
成员筛选在完整两版解析、比较与分类之后投影，不改变规则或解析上下文。

actual.json 与默认实际 JSON API 不读取或包含意图。报告附加 conformance.json 与图的符合性字段。
CLI --conformance 输出该文档；--member 只用于符合性投影。未选此输出而使用 --member 必须失败。
stdout 与 --out 输出同一份已选择的文档：默认是实际 JSON，--conformance 是符合性 JSON。
--report 始终保留完整上下文的 HTML、graph.json、actual.json、conformance.json 和 summary.md。
--member 仅筛选 stdout/--out 的符合性行，不筛选报告或移除全局预期变化。
参数采用精确 workspace 成员路径（如 packages/core/storage），匹配行的 member 或 targetMember，保留出向与入向关系。
projection 记录参数和 matched。未在当前或 BASE 清单出现的成员返回空行及 matched=false，不报告成员符合。
--out 不得覆盖报告文件；默认实际输出可与报告的 actual.json 同名，因为内容相同。
没有全局预期时报告保留 unknown 和“输入缺失”，不把无规则写成整体符合。
统一评审页展示责任映射、规则出处、入口证据、存量/新增/未知和预期变更；选结果可以聚焦组件。
叠加及导出包含当前选择范围的符合性行，不把静态符合性颜色称为运行安全。

钩子同时反馈新增违规和预期改动。只改当前或历史预期路径、或预期所引用的Markdown源也须触发。已退出的手写bindings不是当前输入。
超时/解析失败沿原错误输出，不假成功；应产生 Finding 的真实验收场景须 ≤40 秒、有预期 Finding、未跳过且无 systemMessage。
普通无读数与已反馈去重保持静默；错误显示 systemMessage 并记录原因，不能算成功测量。
health 保持旧块与硬线，增加一行符合性摘要，总摘要 ≤15 行。
