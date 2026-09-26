# skill-package 实现设计

> 本批设计已接受（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)／[D-065](../../../../record/decisions/assets-runtimes-formal-acceptance-2026-09-26/decision.md)）。此状态不表示实现或实际验证完成。

契约：[`data.skill-package` v2](../../../../spec/data/skill-package/v2/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律为**已接受的设计**。源码已进入 HUB；下文初稿投影表中的「未实现／候选」是设计接受时基线，实际证据与 SP-3 未闭合范围分别登记，不据源码存在提升整包完成状态。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
S-20 第 5、6 条要一个 YAML 1.2 解析器：第三方包 `yaml`（[下文](#skillmd-的-yaml-读法)）是**候选依赖，版本钉定与许可核对在实施程**（[D-060 §八 M55](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，同 M44 的实现期事项口径，不另出决定）。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

## 公开面

**全部即公开函数面**（[SYS-OPEN](../../../../foundation/cross-system-constraints/requirements.md#sys-open)）：不依赖 Cordis、会话、租户或存储，单独 `import` 即用；**没有 Cordis 服务面**（[下表](#cordis-原语本节点一样也不用)）。核对：[依赖表](#依赖作用域与绑定)只有本批纯模块、`ajv` 与候选的 `yaml`，不 import `@deepseek-ai/cordis`、`kernel-basis`、`storage`，不解析任何服务键；读目录、解析链接不在本模块（SP-2）。主要导出（候选名）：

| 导出 | 契约坐标 |
|---|---|
| 类型 `SkillPackage`；`skillDependencies(pkg)`；`skillBodyContract`（asset-model 端口的那一份） | [S-1](../../../../spec/data/skill-package/v2/contract.md#s-1-技能包是什么)～[S-19](../../../../spec/data/skill-package/v2/contract.md#s-19-包是版本内容的一个整体)、[S-32](../../../../spec/data/skill-package/v2/contract.md#s-32-执行环境要求) |
| `readSkillMd(text) → { ok: { manifest, body, unknownKeys } } \| { rejected } \| SkillReadUndetermined` | [S-20](../../../../spec/data/skill-package/v2/contract.md#s-20-skillmd-的文本形式与定界)；未判定分支是下述实现缺口，不是新拒绝值 |
| `readSkillPackage(entries)`（条目由调用方读好、链接已解析） | [S-21](../../../../spec/data/skill-package/v2/contract.md#s-21-包的目录形式) |
| `judgeSkillPackage(value) → { ok } \| { rejected }` | [S-22](../../../../spec/data/skill-package/v2/contract.md#s-22-规范表示)～[S-25](../../../../spec/data/skill-package/v2/contract.md#s-25-表示层拒绝不是判定也不修补) |

**函数层不承诺**：包与资源字节同一版本整体不变、正文两条路读到同一段文字、目录形式的符号链接不逃出包根——归存储、读正文的两条路与持有目录的那台宿主（[装配给 vs 协议给](#装配给-vs-协议给)）。

## 契约到 Cordis 的投影

### Cordis 原语：本节点一样也不用

| 必答项 | 本节点 | 依据 |
|---|---|---|
| 插件边界 | **无插件**。资产治理、注册表、执行运行时、斜杠命令、工作区读入方各自 `import` | 契约没有操作与提交点 |
| 服务键 | 无 | — |
| `inject` 关系 | **无**；`skillBodyContract`（asset-model 端口的那一份）是普通值 | — |
| effect 装卸 | **无装载效应**（0 行） | — |
| 事件派发 | **不发、不听**；没有事件能越过租户或会话边界 | — |
| 存储 | **无**：包与资源字节的保存归资产治理的存储 | S-19 |

### 装配给 vs 协议给

[第五节](../../../../spec/data/skill-package/v2/contract.md#五装配给与协议给)六行里，本节点给出「文本形式的读法」（`readSkillMd` 纯函数，不随部署变）、「名字相等」（逐码点）与「表示层校验」的入口；
「包与资源字节同一版本整体不变」「正文两条路同一段文字」「目录形式的符号链接判定」归存储、读正文的两条路与持有目录的那台宿主。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/skill-package/v2/contract.md#s-1-技能包是什么)～[S-19](../../../../spec/data/skill-package/v2/contract.md#s-19-包是版本内容的一个整体)、[S-32](../../../../spec/data/skill-package/v2/contract.md#s-32-执行环境要求) 包的形状、键的处置、资源、脚本、定义记录、组合清单、依赖、设置项、执行环境要求 | 类型 `SkillPackage`；`skillDependencies(pkg)`；`skillBodyContract`（判正文与名字、推属性、列引用） | 正文逐字：`body` 是字符串值，**本模块没有任何对它做替换、插值或执行的函数** | V-1、V-3；SC-1、SC-4 |
| [S-20](../../../../spec/data/skill-package/v2/contract.md#s-20-skillmd-的文本形式与定界) 文本形式 | `readSkillMd(text)`，返回三支见公开面 | 按行找开头与**独占一行**的闭合 `---`（LF 或 CRLF），不去 BOM；frontmatter 交 YAML 1.2 解析，键重复即 `malformed`；核心键类型不对即 `malformed`、不强转；`body` 是闭合行终止符之后的全部文本，逐字 | V-4（examples 第 6 节十五行，比对读出的值本身）；自定义标签键等价的未判定部分见 SP-3 |
| [S-21](../../../../spec/data/skill-package/v2/contract.md#s-21-包的目录形式) 目录形式 | `readSkillPackage(entries)`：`entries` 是调用方读目录得到的条目（路径、类别、字节，链接已解析并注明是否落在包根之外） | 纯函数判 `manifest_missing`、`resource_escapes`、非常规文件；**读目录与解析链接不在本模块** | V-5 要真实文件系统，那一半归读目录的一方 |
| [S-22](../../../../spec/data/skill-package/v2/contract.md#s-22-规范表示)～[S-25](../../../../spec/data/skill-package/v2/contract.md#s-25-表示层拒绝不是判定也不修补) 拒绝值与次序、不修补 | `judgeSkillPackage(value)` | 定义记录的格式不认得即拒，且先于其余（S-30） | V-2 |

### SKILL.md 的 YAML 读法

| | 手写一个只认「键: 标量」的子集 | `js-yaml` | **`yaml`（本节点选）** |
|---|---|---|---|
| YAML 1.2、键重复即拒、不强转 | 子集读不了 `metadata` 的嵌套映射与多行标量，**不是 YAML 1.2**，违反 S-20 第 5 条 | 1.2（v4 起）；重复键默认报错 | 1.2 核心模式；`uniqueKeys` 默认开 |
| 新依赖 | 无 | 有 | 有 |

**初稿所列三条行为**：默认模式是 YAML 1.2 core、重复键默认报错、`name: no` 读成字符串。实施已采用 `yaml` 2.9.1（ISC），catalog／锁已钉定；公开文档与真实探针已核这三条，但默认重复键判等不足，实际配置和替代节点比较见下段。规范例子与原始结果须按 [verification.md](verification.md) 逐项登记，不能用默认行为推断复杂键完整性。

**S-5／S-20 的实施读法（2026-09-26，独立 spec-reviewer 已核，主调度技术采用）**：按 YAML 节点解析所得类型检查六个核心键，不把库对未识别 local tag 的 fallback string 当成已成功构造的字符串。核心值 `name: !foo x` 按 M16 拒绝；`description: !!str 123` 是真实字符串，`!!int 123` 不字符串化；单独 `!` 的非特定标签不能误当未知 local tag 拒绝。此读法兑现已有类型前置，不新增自定义标签政策，依据为 [YAML 1.2.2 §3.3.3～3.3.4](https://yaml.org/spec/1.2.2/#333-recognized-and-valid-tags)（1.2.2 未改变 1.2 的规范规则）。

未知属性、非字符串或复杂键不能强转成有效 manifest 键，按 S-5 丢弃并留下可见 `keySource` 等读入痕迹。未知属性自身含未识别标签不能一概拒整包；若其 anchor 被核心值引用，按 alias 解析后的真实节点类型检查。`metadata` 与 `allowed-tools` 属核心类型检查，不按未知属性丢弃。重复键检查覆盖原 frontmatter mapping，包括最终丢弃的键；库 `uniqueKeys` 默认开启不替代复杂键／带标签键／alias 的实测与节点等价检查。实际探针、正反例和采用版本许可挂本包 evidence；此说明不声称这些检查已经完成。

**键等价的技术投影与未闭合范围（2026-09-26）**：采用 `yaml` 2.9.1 Core 模式的节点图，显式 `resolveKnownTags: false`，不随输入自动扩展到 YAML 1.1 timestamp／binary 等附加标签；关闭库基于 JS 值的 `uniqueKeys`，由模块对整个映射图检查 tag 与 canonical 内容；整数使用无损表示，浮点键规范化原文字，不能因 JS 数值舍入或溢出把不同键合并。复杂映射按配对判等，alias 同节点相同；循环键沿当前比较路径的已访问节点对共归纳，是本实现公开的技术选择。

同一未识别 scalar tag 的不同节点若缺少 canonical 知识，不能把 fallback string 或源字面当作判等权威。只有键唯一性最终确实依赖该未知关系时，给 `SkillReadUndetermined = { undetermined: { reason: 'yaml_key_tag', tags: readonly string[] } }`；能确定的非法核心值、重复键与解析失败仍先给既有 `malformed`。`readSkillPackage` 原样承接这一未判定分支；消费者必须先收窄 `ok`，不能只排除 `rejected` 就登记资产。未知属性的值本身不需要判等时仍按 S-5 丢弃留痕。

已识别 Core tag 的内容或节点种类不符合该 tag 时，库警告后的 fallback 不是成功解析：即使位于最终丢弃的未知属性，也按 S-20 第 5、8 条的解析失败给 M16。只判已识别 tag 的实际失败，不把一切警告或未识别 local tag 一概拒绝。

以上三值结果暴露实现与消费路径的缺口，**不声称已完整兑现 S-20 的所有 YAML 输入域**，也不改变冻结规格的拒绝集合；自定义标签 canonical 知识不足的部分须继续登记 SP-3，不能凭规范例子与普通输入通过把它翻成完整 PASS。

目录输入中的 `.omne/skill.json` 采用 CB 严格无损 JSON 读入；语法或解码后重复键失败归中性的 `{ rejected: 'malformed' }`，不套用只针对 SKILL.md YAML 的 M16，不自行创造 M 编号。链接事实由调用方显式交入，纯模块不访问文件系统。
**落选方（手写子集）的最强论证**：零依赖、行为完全可控。**它输给契约**：S-20 明写「按 YAML 1.2 解析」，子集读法会让合法的 frontmatter 被拒。**本方弱点**：多一个第三方依赖，要进 pnpm catalog。置信度：**中**（在两个库之间）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v2、`data.content-blocks` v2、`data.tool-definition` v2 | [asset-model](../asset-model/README.md)、[content-blocks](../content-blocks/README.md)、[tool-definition](../tool-definition/README.md) | 随包版本 | 静态 import |
| YAML 1.2 解析 | 第三方 `yaml` 2.9.1（ISC）；Core 与明确配置见上文 | 随锁定版本 | 静态 import |
| 被消费 | slash-command、asset-evaluation、资产治理、注册表、执行运行时、工作区读入方 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；**不抛异常**，YAML 库抛出的解析错误在本模块内收成 `malformed`。拒绝不是判定、也不修补（S-25）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/skill-package/verification.md#静态检查义务)：SC-1 的本节点这一半由构造兑现（不导出任何作用于 `body` 的变换函数），SC-4 由推出规则模块的 import 白名单（候选）承载；SC-2（运行脚本的入口）、SC-3（放行判断与装配的输入）落在执行运行时与注册表。规则都**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第九节）不重抄。本节点自己的：

- **SP-1 `yaml` 进 catalog**：采用 2.9.1（ISC）并已钉 catalog／锁；原候选与默认行为核对已处置，实际自定义键等价仍按 SP-3 登记，不以采用库闭合。owner：本节点。
- **SP-2 读目录的一方**：`readSkillPackage` 只收已解析过链接的条目；读目录、判符号链接是否落在包根之外，归持有目录的那台宿主上的读入方（工作区读入、导入器）。跨节点交接，owner：主线指派。
- **SP-3 未识别 scalar 标签键等价**：缺少已识别标签的 canonical 知识时，读入入口给显式 `undetermined`，不能产出已接受 manifest。包括 local 标签与未采用的非 Core 全局标签。owner：本节点与读入消费者；闭合需有该标签的真实规范化依据和正反例，当前不以完成普通 Core 输入域代替此义务。
