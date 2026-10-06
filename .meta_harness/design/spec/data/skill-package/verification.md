# 验证义务与方法

本页维护验证义务、方法、前提与限制。采用版本与接受状态从专题入口和 registry 读取；实现状态从实际成员入口读取。单次执行输入、配置、结果与反例留工作树 `tmp/`，不维护运行台账。删除旧日志不关闭任何义务或缺口。

## v3 文本与目录的验证义务

按 v3 contract 的 S-5/S-20/S-21/S-24 与 M16，对十四个文本和三个目录规范实例核实际结果、正文与 unknown 痕迹；完整图覆盖复杂键、alias、ignored value 映射。目录 escape 不得被文本 M16 遮蔽。

双版本纯值判断与正文、作者引用 v2/v3 的正反例分开检查；严格 v3 结果不得有 undetermined。核全部自有五个 defs、完整 JSON 字节、两个公开 runtime 路径的实际 resolved hash 和真实打包消费。四/五资源图不是 asset-model v2 全 defs 的通用闭包。

W6 的 v3 读入到旧 v2 值判断、asset-model v3／asset-evaluation v3／slash-command v2 组合须单列；不能把旧 v2 的判读外推到该组合。Connector 与外部来源的九项义务保留原 owner 与范围。

## 证据义务

| # | 义务 | 证据形式 | 覆盖哪些条款 | 责任与限制 |
|---|---|---|---|---|
| V-1 | **形状校验**：[`examples.md`](v2/examples.md) 第 1～5、7～9 节逐行（含变体行，按「在 X 上改动 Y」构造）过 Schema，比对「Schema」一列。第 6、10 节不参与 | Draft 2020-12 校验器（能按 `$id` 解析到 `data.content-blocks/v2`、`data.asset-model/v2`、`data.tool-definition/v2` 及它们各自引用的 Schema）＋ 按节绑定的 `$defs` | [S-2](v2/contract.md#s-2-技能名的词法)～[S-15](v2/contract.md#s-15-设置项声明)、[S-18](v2/contract.md#s-18-常驻不在包里)、[S-32](v2/contract.md#s-32-执行环境要求) 的**形状那一面** | 形状校验不提供具名拒绝值或 M 编号，非 JSON 文本和目录由 V-4/V-5 另验。 |
| V-2 | **拒绝值的具名与优先级**：对每个拒绝行，接收边界给出的拒绝值等于「拒绝值」一列（含 M 编号）；第 7 节八行各验一个值，第 8 节十一行专验优先级 | 接收边界的一致性用例（同一份输入跨实现比对） | [S-24](v2/contract.md#s-24-表示层拒绝值与判定次序)、[S-25](v2/contract.md#s-25-表示层拒绝不是判定也不修补) | 接收边界提供者核对具体拒绝值与顺序；只验 Schema 通过与否不能代替。 |
| V-3 | **Schema 管不到的约束**：[`examples.md` 第 9 节](v2/examples.md#9-schema-挡不住但同样非法的)逐行——资源路径重复与前缀冲突、设置项项名重复、`default` 不合取值域、名字与所属能力标识不一致 | 接收边界的校验 ＋ 第 9 节 | [S-6](v2/contract.md#s-6-名字与所属能力标识一致)、[S-9](v2/contract.md#s-9-资源条目与包内路径)、[S-15](v2/contract.md#s-15-设置项声明) | 名字一致性由知道能力标识的资产写面、工作区读入方或导入器验证。 |
| V-4 | **文本形式的读法**：[`examples.md` 第 6 节](v2/examples.md#6-skillmd-的文本形式)十五行，比对读出的 `manifest`、`body` 与拒绝值；**比对读出的值本身**，不只看解析成功与否 | 读入方的单元用例（同一份 `SKILL.md` 跨实现读出同一个值） | [S-5](v2/contract.md#s-5-键的四类处置)、[S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-20](v2/contract.md#s-20-skillmd-的文本形式与定界) | name: no 的解析器回归与 see a---b here 的定界回归两条缺一不可；实际比对 manifest 与 body。 |
| V-5 | **目录形式的读法**：[`examples.md` 第 10 节](v2/examples.md#10-包的目录形式)八行，在真实文件系统上构造目录（含执行位、符号链接、成环链接） | 读目录一方的集成用例 | [S-21](v2/contract.md#s-21-包的目录形式)、[S-10](v2/contract.md#s-10-资源只被读取不因读取而运行) | 符号链接、循环链接和执行位须在真实文件系统上验证，内存路径模拟不能证明解析后的落点。 |
| V-6 | **规范场景** [S-26](v2/contract.md#s-26-名字对不上即拒)～[S-31](v2/contract.md#s-31-常驻与预批准不从内容生效)：每条一个正例一个反例 | 规范场景演练：真实接收边界、真实读入方、真实放行判断 | [S-6](v2/contract.md#s-6-名字与所属能力标识一致)、[S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-9](v2/contract.md#s-9-资源条目与包内路径)、[S-12](v2/contract.md#s-12-定义记录)、[S-13](v2/contract.md#s-13-组合的工具清单)、[S-18](v2/contract.md#s-18-常驻不在包里)、[S-20](v2/contract.md#s-20-skillmd-的文本形式与定界)、[S-21](v2/contract.md#s-21-包的目录形式) | S-27 两个反例须观察读出值；S-31 正例须观察实际放行结果，收下包不能证明 allowed-tools 未被误当预批准。 |
| V-7 | **消费者路径走查**（[CS-1～CS-8](v2/contract.md#消费者核对场景)） | 结构化走查（评审对象）；有提供者之后升级为真实演练 | [S-3](v2/contract.md#s-3-技能包的四个部分)、[S-6](v2/contract.md#s-6-名字与所属能力标识一致)～[S-17](v2/contract.md#s-17-属性项投影规则)、[S-19](v2/contract.md#s-19-包是版本内容的一个整体)～[S-21](v2/contract.md#s-21-包的目录形式) | CS-2/CS-4 的满足判据归 tool-definition 的 G-5，CS-8 的包内容判据归本契约 G-6；按当前 gap owner 接续，未决不声称兑现。 |
| V-8 | **跨进程**：[第五节](v2/contract.md#五装配给与协议给)右列逐行演练 | 规范场景演练 | [S-8](v2/contract.md#s-8-正文逐字不展开不执行)、[S-19](v2/contract.md#s-19-包是版本内容的一个整体)、[S-21](v2/contract.md#s-21-包的目录形式)、[S-24](v2/contract.md#s-24-表示层拒绝值与判定次序) | 单机同进程不构成接收边界，跨进程演化时须逐行兑现协议义务。 |
| V-9 | **静态检查**（[SC-1～SC-4](#静态检查义务)） | 实现语言的静态检查（具体形式归 realization） | 见下表 | 实现拥有者提供可复跑静态检查，并包含语义消失时失败的负控。 |

### 静态检查义务

每条都要能被另一个 owner 照着跑，且**在该语义消失时会失败**。义务列出与文件存在均不能代替实际符合性检查。

| # | 检查什么 | 对应条款 | 责任与限制 |
|---|---|---|---|
| SC-1 | 读正文、送正文的代码路径上不存在对 `body` 的替换、裁剪或插值；不存在把正文交给任何 shell 或求值器的调用 | [S-8](v2/contract.md#s-8-正文逐字不展开不执行) | 验证义务 |
| SC-2 | 运行技能脚本的入口只接受脚本集合里的路径；不存在按文件系统执行位或任何「可执行」标记决定能不能跑的分支 | [S-10](v2/contract.md#s-10-资源只被读取不因读取而运行)、[S-11](v2/contract.md#s-11-脚本集合) | 验证义务 |
| SC-3 | 放行判断、可用性解析与装配的输入里不出现清单头的 `allowed-tools`、`compatibility`、`metadata`；列举资源的读面不读定义记录 | [S-5](v2/contract.md#s-5-键的四类处置)、[S-12](v2/contract.md#s-12-定义记录)、[S-16](v2/contract.md#s-16-由包得出的依赖声明) | 验证义务 |
| SC-4 | 属性项推出规则只读包本身（不读持有方、所在格、时间、环境）；不产出 `disabled`、`usableBy` 与治理类的项 | [S-17](v2/contract.md#s-17-属性项投影规则) | 验证义务 |

## 对齐义务

| 对齐什么 | 当前拥有者与核对要求 |
|---|---|
| 名字与外壳 | asset-model v2 S-2/S-10/S-12 拥有 CapabilityName/CapabilityId 与 skill 外壳；引用本契约 SkillPackage。 |
| 共用拒绝值 | tool-definition v2 S-26 拥有 setting_category_unknown、binding_layer_unknown；asset-model v2 S-27 原名携带 name_mismatch。environmentRequirement 的绑定层按本契约 S-24 核。 |
| 作者设置生效值 | 本契约 S-15 定声明；Skills() 的公开承诺须拥有值交出。该拥有者尚未建立时保持 gap，不从包形状推已兑现。 |
| 执行环境 | tool-definition v2 S-11 拥有 TargetEnvironment；本契约 S-32 拥有 environmentRequirement，实际满足归跑它的工具。Skills() 的 targetEnvironment 与技能 environmentRequirement 合成 exec_script 落点归 G-9 的 Skills() owner。 |
| 使用资格 | asset-model v2 S-36 拥有八类共用 usableBy；本包不推出该项，连接件安装资格按连接件的当前拥有者核。 |
| ② 型展开 | 斜杠命令消费本契约 S-8 的 body，逐字传递、不展开占位符，来路由 content-blocks v2 S-8 拥有。 |
| 工作区 source | asset-model v2 S-24 指到的目录按本契约 S-21 读取；读入痕迹形状归 asset-evaluation。 |

## 结果与反例

### Skill 形状的校验方法与限制

按实例各节的 $defs 校验设置与包内容；边界字符串构造真实 1024/1025 个字符，变体按原实例改指定一处。name_mismatch、不知道所属能力标识及其他需要上下文的行须由真实边界另判。Schema 不给出拒绝值或 M 编号，第6、10节非JSON场景另验；形状检查不支持 V-2 之后的场景义务。

分别判读形状、具名拒绝、文本与目录读法、规范场景和真实组合，手核条款不代替边界实现。

## 形式化工件

**本契约不选用形式化工件，`formal/` 不建。**理由在[契约的性质一节](v2/contract.md#性质)末尾：
没有状态转移；结构约束由 Schema 的条件与条款直接表达；唯一的跨对象结构性质（组合图不得成环）要看别的资产，归装配。
**这不是把义务省掉**：它们被改写成了 V-1～V-9。本契约**不拥有任何进展性质**；`formal-tasks.json` 里没有、也不应有本契约的任务。

## 变化的影响

规范内容归 [v2 contract](v2/contract.md) 与 [v3 contract](v3/contract.md)，采用关系由专题入口维护。共享 CapabilityId、MediaType、DependencyName、TargetEnvironment 或属性声明变化时同步 V-1 和所有真实消费者，不能把旧形状结果套到新表示。

environmentRequirement 是固定定义字段，仅在有脚本时可声明，不是可逐层配值的 targetEnvironment 设置；不存在时表示没有额外要求，依赖声明携带它的原值，满足判据归工具提供者。作者普通 targetEnvironment 设置不与此字段混同。

脚本集合只含 scripts/ 下的正确资源路径：根文件名 scripts 不是脚本集合。资源读取和文件执行位均不构成运行许可，读取正文不执行。内容摘要及完整性 G-6/G-7、设置交出与环境合成等 gap 按现行 owner 接续；不因日志删除关闭。
