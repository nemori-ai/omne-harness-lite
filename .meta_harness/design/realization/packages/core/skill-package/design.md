# skill-package 实现设计

契约：[`data.skill-package` v1](../../../../spec/data/skill-package/v1/contract.md)（candidate）。下文的 S-n 都指这份契约；引别的契约写全坐标。
导出名、类型名一律**候选**，源码不存在。

## 实现路径与来源

**自建一个 TypeScript 纯模块**，写法与 [content-blocks](../content-blocks/design.md#实现路径与来源) 相同：`ajv` 8.20.0 的 Draft 2020-12 入口、Schema 原样复制并逐字节核对、拒绝值[按契约次序逐条判](../content-blocks/design.md#拒绝值按契约的次序逐条判不从-schema-错误里反推)。
S-20 第 5、6 条要一个 YAML 1.2 解析器：第三方包 `yaml`（[下文](#skillmd-的-yaml-读法)）是**候选依赖，版本钉定与许可核对在实施程**（[D-040 §八 M55](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)，同 M44 的实现期事项口径，不另出决定）。
**Cordis 版本**：采用 4.0.4（[D-025](../../../../record/decisions/cordis-adoption-version/README.md)）；本模块不依赖 Cordis。

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

[第五节](../../../../spec/data/skill-package/v1/contract.md#五装配给与协议给)六行里，本节点给出「文本形式的读法」（`readSkillMd` 纯函数，不随部署变）、「名字相等」（逐码点）与「表示层校验」的入口；
「包与资源字节同一版本整体不变」「正文两条路同一段文字」「目录形式的符号链接判定」归存储、读正文的两条路与持有目录的那台宿主。

### 契约责任 → 模块公开入口 → 实现 → 符合性依据或缺口

全部**未实现**；「实现」一列写的是候选做法。

| 契约责任 | 模块公开入口（候选） | 实现（候选做法） | 符合性依据或缺口 |
|---|---|---|---|
| [S-1](../../../../spec/data/skill-package/v1/contract.md#s-1-技能包是什么)～[S-19](../../../../spec/data/skill-package/v1/contract.md#s-19-包是版本内容的一个整体)、[S-32](../../../../spec/data/skill-package/v1/contract.md#s-32-执行环境要求) 包的形状、键的处置、资源、脚本、定义记录、组合清单、依赖、设置项、执行环境要求 | 类型 `SkillPackage`；`skillDependencies(pkg)`；`skillBodyContract`（判正文与名字、推属性、列引用） | 正文逐字：`body` 是字符串值，**本模块没有任何对它做替换、插值或执行的函数** | V-1、V-3；SC-1、SC-4 |
| [S-20](../../../../spec/data/skill-package/v1/contract.md#s-20-skillmd-的文本形式与定界) 文本形式 | `readSkillMd(text) → { ok: { manifest, body, unknownKeys } } \| { rejected }` | 按行找开头与**独占一行**的闭合 `---`（LF 或 CRLF），不去 BOM；frontmatter 交 YAML 1.2 解析，键重复即 `malformed`；核心键类型不对即 `malformed`、不强转；`body` 是闭合行终止符之后的全部文本，逐字 | V-4（examples 第 6 节十五行，比对读出的值本身） |
| [S-21](../../../../spec/data/skill-package/v1/contract.md#s-21-包的目录形式) 目录形式 | `readSkillPackage(entries)`：`entries` 是调用方读目录得到的条目（路径、类别、字节，链接已解析并注明是否落在包根之外） | 纯函数判 `manifest_missing`、`resource_escapes`、非常规文件；**读目录与解析链接不在本模块** | V-5 要真实文件系统，那一半归读目录的一方 |
| [S-22](../../../../spec/data/skill-package/v1/contract.md#s-22-规范表示)～[S-25](../../../../spec/data/skill-package/v1/contract.md#s-25-表示层拒绝不是判定也不修补) 拒绝值与次序、不修补 | `judgeSkillPackage(value)` | 定义记录的格式不认得即拒，且先于其余（S-30） | V-2 |

### SKILL.md 的 YAML 读法

| | 手写一个只认「键: 标量」的子集 | `js-yaml` | **`yaml`（本节点选）** |
|---|---|---|---|
| YAML 1.2、键重复即拒、不强转 | 子集读不了 `metadata` 的嵌套映射与多行标量，**不是 YAML 1.2**，违反 S-20 第 5 条 | 1.2（v4 起）；重复键默认报错 | 1.2 核心模式；`uniqueKeys` 默认开 |
| 新依赖 | 无 | 有 | 有 |

**选 `yaml` 所依的三条行为是待核对主张**：默认模式是 YAML 1.2 core、重复键默认报错、`name: no` 读成字符串——**假设，须按 source-check 取证**（basis 无此条目，它不是 Cordis 语义），落包时以包内测试（examples 第 6 节）核。
**落选方（手写子集）的最强论证**：零依赖、行为完全可控。**它输给契约**：S-20 明写「按 YAML 1.2 解析」，子集读法会让合法的 frontmatter 被拒。**本方弱点**：多一个第三方依赖，要进 pnpm catalog。置信度：**中**（在两个库之间）。

## 依赖、作用域与绑定

| 消费的精确契约 | 实际提供者／解析方式与范围 | 工作中绑定与变更生效点 | 缺席、撤回和旧引用政策 |
|---|---|---|---|
| `data.asset-model` v1、`data.content-blocks` v1、`data.tool-definition` v1 | [asset-model](../asset-model/README.md)、[content-blocks](../content-blocks/README.md)、[tool-definition](../tool-definition/README.md) | 随包版本 | 静态 import |
| YAML 1.2 解析 | 第三方 `yaml`（候选依赖，版本钉定与许可核对在实施程，M55） | 随锁定版本 | 静态 import |
| 被消费 | slash-command、asset-evaluation、资产治理、注册表、执行运行时、工作区读入方 | 普通包依赖；契约出 v2 另开入口 | 不改 v1 导出 |

包依赖与 catalog 的契约依赖同构（[D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加)），无环。**没有配置项**。

## 状态、并发与失败映射

**无状态、无提交点、无并发。**表示层拒绝 ⇒ `{ rejected: 值 }`（恰一个）；**不抛异常**，YAML 库抛出的解析错误在本模块内收成 `malformed`。拒绝不是判定、也不修补（S-25）。

## 成对的装载与撤除

**本节点没有任何受管效应**（0 行）。

## 静态检查义务怎么承载

[契约的 SC-1～SC-4](../../../../spec/data/skill-package/verification.md#静态检查义务)：SC-1 的本节点这一半由构造兑现（不导出任何作用于 `body` 的变换函数），SC-4 由推出规则模块的 import 白名单（候选）承载；SC-2（运行脚本的入口）、SC-3（放行判断与装配的输入）落在执行运行时与注册表。规则都**尚无**。

## 实施缺口与消费者影响

契约的已知缺口（第九节）不重抄。本节点自己的：

- **SP-1 `yaml` 进 catalog**：候选依赖，版本钉定与许可核对在实施程（D-040 §八 M44、M55）；三条行为以包内测试核，核不过就换 `js-yaml`。owner：本节点落包时。
- **SP-2 读目录的一方**：`readSkillPackage` 只收已解析过链接的条目；读目录、判符号链接是否落在包根之外，归持有目录的那台宿主上的读入方（工作区读入、导入器）。跨节点交接，owner：主线指派。
