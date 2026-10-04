# 全局架构符合性报告

形状由 conformance-model.ts 拥有，输入校验由 constraints.ts 拥有。本页约束报告行为。
依据：已授权 N3、D-114 的有效 IC、[系统预期](../../../../.meta_harness/design/architecture/system-intent.md)。

## 输入与责任

默认读取 .meta_harness/design/architecture/constraints.json。规则身份仅取公开 RULE_IDS。
domains 和 roles/rules 的身份分别唯一。入口路径为仓库相对路径，只接受精确路径或末尾 /**。
角色匹配优先最精确路径；同精度冲突、candidate、unknown 与未映射都不能作采用的层次证据。
空规则列表合法且不同于文件缺失。未知规则、坏 JSON、越界路径和重复身份必须失败。
全局输入与原有效 realization 例外分别保留拥有者，不复制插件绑定。

HEAD 与 BASE 分别读本版完整 workspace、源码、manifest 和解析配置。
抽取后的 Import occurrence 包含 resolvedPath；workspace 名称已识别但源码未解析不能作已解析入口。
规则结果身份包括规则、源入口、目标入口/未解析名称、符号和类型/引用形式，排除行号。
同包内两个入口不能共用一个违反规则身份。未知表达式继续携带位置和原因。

## 机械子集

| 身份 | 能判断的范围 | 不能据此证明 |
|---|---|---|
| LAYER-ENTRY | adopted 交互入口直接 import/export 业务存储契约或适配器，含类型引用 | 函数内部授权与间接调用的业务语义 |
| LAYER-DIP | adopted 策略入口引用 adopted 交互、存储适配或装配源码 | 外部库的所有语义与运行注入方向 |
| IC-1 | 观察到的服务定义位于 core 外，或同键多处定义 | 动态定义/运行提供者唯一性 |
| IC-2 | 已识别 ctx.provide 旧形状，不能替代 Service 子类规则 | 回收、并存及在途状态 |
| IC-3 | 定义是 Context 增补，或缺少 contract/owner | 签名/行为与契约完全一致 |
| IC-4 | src/index.ts 根的已解析源码闭包引入 Cordis 或本包 cordis 入口；保留原 kernel-basis/apps 例外 | 其他根文件、未解析闭包、CJS/dynamic 非字面量 |
| IC-5 | 非装配入口跨成员依赖非 core/util；精确符号同提交例外取 BASE 原节点声明 | 同提交的行为保证 |

IC-5 的 apps 入口没有层次定位时是 unknown；packages 的原有效提供者声明可确定非装配责任。
尚不明确的例外不得当作符合。泛化存储契约即使满足 DIP，仍由 LAYER-ENTRY 判交互越界。
已接受 IC-5 例外与分层要求相冲突时，该分层结果为 unknown 并指出原例外出处，等待负责人裁定。
普通装配只豁免明确定位的源文件；没有 apps 通用分层豁免。
单条 converged 只表示该条有限静态检查没有发现违规，不表示成员或系统整体符合。

IC-6/9/10/11/13/14/16/18/19 及 LSP 保留行为义务；IC-7、SRP/OCP/ISP 留人工判断；
IC-8/12 尚未接入机械规则。IC-15/16 加载器未实现，IC-17 机制待设计。
这些状态须在 JSON、浏览器与 health 中保留。类型同形反例须显示无静态 LSP 证明。

## 比较与反馈

给出 BASE 时，当前实现对 BASE 规则及 BASE 例外比较；BASE 文件缺失表示空全局规则，不能用 HEAD 规则替代。
未给 BASE 时使用当前预期，comparedWith=current；结果的新旧分类为 unjudged，预期变化不比较。
BASE 实现对 BASE 预期构成存量；新违规与存量分别表示。无 BASE 时分类未判。
HEAD 和 BASE 的全局预期及原节点预期变化单列。删除最后规则或整个文件也保留变化。
格式、行号和集合排序不造成预期变更；路径、角色状态、依据、规则或例外变化属于语义变化。
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

钩子同时反馈新增违规和预期改动。只改预期或原 bindings.yaml 也须触发。
超时/解析失败沿原错误输出，不假成功；应产生 Finding 的真实验收场景须 ≤40 秒、有预期 Finding、未跳过且无 systemMessage。
普通无读数与已反馈去重保持静默；错误显示 systemMessage 并记录原因，不能算成功测量。
health 保持旧块与硬线，增加一行符合性摘要，总摘要 ≤15 行。
