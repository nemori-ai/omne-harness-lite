# SystemPromptProfile Schema · review 草案 1

[完整 JSON Schema](system-prompt-profile.schema.json) · [完整实例](system-prompt-profile.example.json)

状态：仅为用户要求查看的 Schema 提案附件；不恢复已撤回的 `spec/domain/` 模型或注册项。
用户已确认的是独立创建/管理/发布、多 Agent 引用、静态纯文本与受限状态动态模板，
以及 `state_key` 必须来自系统控制的限定集合，不能由档案填写者自创。
本页的具体字段、发布状态、引用形式、插值语法和拼接规则均为待 review 的候选表达。

## 范围与字段

一份 JSON 表示档案的**一个内容修订**；不是整个历史数组，也不是运行时渲染实例。
聚合身份为 tenant_id + profile_id，内容地址为 tenant_id + profile_id + revision。
Schema 版本与内容 revision 分开；本附件版本为 review 草案 1。

| 字段 | 含义 |
|---|---|
| tenant_id / profile_id | 租户归属与稳定档案身份 |
| name / description | 显示名称与可选说明；不自动进入模型提示词 |
| revision | 正整数内容版本 |
| status | draft / published / retired，发布生命周期候选 |
| static_text | 必填字符串，可为空；原样加载，包括看似 `{{variable}}` 的字符 |
| dynamic | 必填，可为 null；否则包含模板、精确状态契约引用与别名绑定 |
| created_at / updated_at | 本修订创建和记录更新的时间 |
| published_at / retired_at | 发布/退役时间；不适用时为 null |

静态为空可表达仅动态；dynamic=null 可表达仅静态；两者为空表达空提示，不能隐式加载旧文本。
字段使用本 Schema 内 `$defs` 复用定义；未为便于演示而向正式模型注册表新增一组基础对象。
未来正式采用时，有已有同义共享定义的字段应引用该权威类型，不能保留平行定义。

## 动态部分与受限状态

- `context_contract_ref`：契约身份与精确版本。契约由宿主/状态 owner 定义，列出可提供状态键及语义；
  作者填写某个 ref 不代表已获得读取权限，必须由宿主按租户、Agent、业务场景验证。
- `variables`：模板局部 alias → 精确 `state_key`。例如 `workspace → session.workspace`。
  key 中的点仅为契约键名，不授权任意对象遍历、属性调用或路径访问。
- `template`：候选语法为 `{{alias}}` 一次文本插值。无代码、函数、循环、条件或隐式 I/O。

`state_key` 的约束是**集合成员资格**，不是“符合字符串格式即可”。对候选契约版本 `C`，
每个绑定必须满足 `binding.state_key ∈ DeclaredKeys(C)`。填写者可以自定义模板和局部 alias，
只能引用已声明的状态键；声明和注册由获准的状态提供者承担，不属于填写 Profile 数据的能力。
**限定集不等于全系统写死的 enum**：提供者可以按生命周期注册、撤销；某一契约版本的含义固定，
当前作用域有哪些可用提供者则可以变化。不能靠填写 Profile 数据把未知键变成已注册键。

具体键清单、提供者契约和绑定字段仍待 review。当前 Schema 的 `pattern` 仅做词法检查，
不独立验证集合成员资格或运行时可用性；不能仅凭结构校验通过就接纳或发布动态绑定。
可以从确定的注册视图生成 `enum`，供编辑器选项或离线校验使用；这个枚举是视图快照，
不作为持久 Profile Schema 中的全局固定词表。`$ref` 引用 Schema 也不自动检查运行时提供者。
下面的示例键不构成获准词表。

### 动态注册与移除（候选设计）

区分三件事：键的版本化定义、该键当前生效的提供者、一次渲染实际读取的值。
定义描述精确身份、含义及值契约；提供者由插件持有生命周期与作用域；渲染结果不持有活的 Context 引用。
撤销提供者不抹掉已发布 Profile 所引用的契约定义或已记录的文本；语义变化必须使用新的契约版本。

对租户及 Agent 作用域 `S`、一次确定的装配视图 `G`，候选激活条件为：

```text
ReferencedKeys(Profile) ⊆ DeclaredKeys(C)
                       ∩ ActiveProviderKeys(S, G, C)
                       ∩ AuthorizedKeys(S, G, C)
```

定义检查与激活检查分开；已发布不等于任意时刻都可运行。新增提供者不自动给现有模板增加占位符，
也不授予访问权限；同一作用域的冲突注册不能按偶然加载顺序取胜。
计划移除仍被使用的必需提供者时，候选默认行为是拒绝该变更，或者在同一装配变更中显式替换提供者、
切换档案修订或停用受影响绑定。意外失效时，受影响绑定不可继续启动渲染，并明确暴露依赖不可用。
不静默删掉占位符、不填空值、不偷用另一作用域的同名提供者。

正在执行的渲染与移除必须有明确先后边界：停止接纳受影响的新渲染，等待已有读取完成，
或取消并确认停止，再释放其提供者。一次结果不能混用切换前后的提供者绑定；失败的未完成结果不能发布。
已经生成的文本按后续业务契约约定的有效期使用，不能冒充移除后新鲜求值的结果。
这并不保证多个外部状态值来自同一物理时刻，所需读取一致性仍由状态契约定义。

Cordis 的 `inject` 管服务依赖；若多个状态键位于同一个服务注册表中，仅注入该服务不能保证某个键存在。
本项目需要将 Profile 的键引用解析成受管理的运行时依赖，并处理注册变更；具体承载形式尚未选定。
卸载所需的注册清理可使用 Cordis effect/disposer，但业务依赖、租户授权和正在进行的读取仍须显式处理。
“无副作用”在这里应收敛为没有注册泄漏、悬空读取或静默语义漂移，不能承诺删除必需能力后仍照常运行。
已进入会话历史或已发送给模型的内容也不会因卸载而撤回。

依据与架构讨论见 [动态状态键与提示词绑定](../../../../docs/architecture.md#dynamic-state-keys-and-prompt-bindings-design-discussion)。

候选渲染语义：只把严格的 `{{alias}}` 当占位符（alias 使用 Schema 中 ASCII 标识语法）；
遇到未配对或非法的双花括号分隔符拒绝，单独普通花括号是文本。无空白变体、无转义语法；
需要字面双花括号时可放入静态部分或通过获准文本值传入，替换结果不递归解释。
每个模板引用必须有声明且属于获准状态键；宿主提供文本投影，缺值或非文本拒绝，不隐式 stringify/default。
原始业务状态可以是结构化类型，如何投影为供模板使用的文本由上下文契约负责，不由模板任意访问。

示例中的 `example.assistant-start-context` 和状态键仅为演示，没有宣称已经定义系统统一状态词表。
例如某次宿主供应 `user.preferred_language=中文`、`session.workspace=/workspace/project`，
动态结果就是“本次工作语言：中文。当前工作目录：/workspace/project。”。

## 引用、组合与生命周期

Agent 使用 `$defs/ProfileRef` 引用精确 tenant_id/profile_id/revision。多个 Agent 可持同一个 ref；
各自的渲染结果独立，不回写模板。新绑定仅解析 published 修订，退休保留历史引用的可解释性。
是否支持自动跟随新发布版本、版本切换时机、render 的触发点与结果有效期仍由后续业务契约决定。

候选组合规则：先静态、后动态；仅两者均非空时插入两个 LF（`\n\n`）。不 trim、不规范化文本。
静态部分从不经过模板解释。不同运行环境只影响动态渲染结果，不影响同版本静态内容。

候选发布规则：draft 可编辑，publish 冻结内容；published 可 retired，不能回 draft；
发布后修改静态/动态定义需新建更高 revision。status 与更新时间变化不是对已发布内容的原地编辑。
发布时验证模板和状态契约引用，实际状态值在运行时验证。渲染失败不修改 Profile 发布状态。
本 Schema 不嵌入 hook 名、Cordis 实例、执行代码、工具 Schema 或 Agent 列表。

## 结构校验与语义校验的界线

JSON Schema 能检查：字段/类型、未知字段、标识形状、精确引用形状、发布状态对应时间字段、
静态文本或动态模板的结构。date-time 必须由启用了 FormatChecker 的 validator 执行。
`.invalid` 的 `$id` 是本地标识，不发起网络获取。

以下不能由本 Schema 单独保证，正式发布/管理/渲染服务仍需检查：

1. 聚合及 revision 唯一、版本递增、已发布内容不可修改、合法状态转换。
2. updated_at ≥ created_at、retired_at ≥ published_at 等时间顺序。
3. 模板语法、alias 声明一致、状态契约存在且键合法、租户和调用者权限。
4. 静态原样保留、动态仅一次插值、渲染结果和实际请求的来源关联。

不能将本 Schema 的结构验证表述为上述行为约束已获证明。

## 本次结构验证

使用带格式校验依赖的 `jsonschema[format]` 与 `Draft202012Validator(..., format_checker=FormatChecker())`，
已通过元模式检查、30 个结构正反例及 ProfileRef 内部引用解析，包含非法 RFC3339 时间拒绝。
模板渲染、状态契约解析、权限与生命周期转换不在这些结构检查的覆盖范围。
