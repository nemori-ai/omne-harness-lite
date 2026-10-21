# Request Context 公开接口导航

本页是导出索引，不是第二套签名。精确类型归 [src/index.ts](../src/index.ts)，非类型行为归 [SPEC](../SPEC.md)，对象的身份与生灭归[对象模型](object-model.md)。每个定义的输入、输出与失败行为按所列条款查找。

## 导出入口

| 入口 | 源码 | 发布产物 | 调用者 |
| --- | --- | --- | --- |
| `@omne-harness/request-context-contract` | [src/index.ts](../src/index.ts) | `dist/index.js`、`dist/index.d.ts` | 任何包。协调者一侧的适配器、历史持有者与交付面、request-context 的实现成员和独立调用方都从这里取用 |

本成员只有根入口，没有 `./cordis` 入口。根入口不导入 Cordis，见 [Cordis 说明](cordis.md)。服务键 `requestContext` 与它的 `Service` 定义归 [request-context-cordis-contract](../../request-context-cordis-contract/README.md)。

根入口现在是空导出，没有类型，也没有运行值。[public-entry.spec.ts](../tests/public-entry.spec.ts) 断言运行导出为空。

## 定义索引

### 现有导出

没有。`src/index.ts` 只有 `export {}`。

### 随实现切片进入的导出

下列名称由 SPEC 与对象模型点名，现在不在 `src/` 里。签名随实现进入，形状以 SPEC 和对象模型为准。某项进入 `src/` 后，在本节上方加「现有导出」表并把它移过去，同时同步导出测试。所属模块见[内部架构](architecture.md#模块与依赖)。

值类型：

| 名称 | 对象模型 | 条款 |
| --- | --- | --- |
| `AssemblyInput` | 组装输入，七组 | [RQ-02](../SPEC.md#rq-02-组装的前置输入) |
| `RequestCandidate` | 请求候选 | [RQ-02](../SPEC.md#rq-02-组装的前置输入)、[RQ-05](../SPEC.md#rq-05-完整预算与候选完成) |
| `Coverage` | 覆盖证据，含前缀变化原因 `prefixBreak` | [RQ-02](../SPEC.md#rq-02-组装的前置输入)、[七层装载布局与前缀](../SPEC.md#七层装载布局与前缀) |
| `FitVerdict` | 装入裁定，四选一 | [RQ-05](../SPEC.md#rq-05-完整预算与候选完成) |
| `RepresentationChoice` | 表示决定 | [RQ-04](../SPEC.md#rq-04-模态与可追溯表示) |
| `SnapshotReminder` | 上下文快照提醒 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀)的 R4 |
| `TailFacts` | 尾部易变提醒 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀)的 R6 |
| `PromptContribution` | 提示词贡献，有序段与变量两类 | [RQ-02](../SPEC.md#rq-02-组装的前置输入) |
| `CompactionPlan` | 压缩计划 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| `PlanProgress` | 计划进度 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界)、[RQ-09](../SPEC.md#rq-09-取消恢复与迟到) |
| `StepRequest` | 步请求，修剪步或摘要步 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| `ContextTransition` | 压缩转换 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| `HistoryEvidence` | 历史依据：epoch 加上界 | [历史源读口与 epoch 视图](../SPEC.md#历史源读口与-epoch-视图) |

四种组装结果与三类失败见对象模型的[领域特有的结果与提交](object-model.md#领域特有的结果与提交)。承载它们的类型名现在没有确定，随值类型模块一起进入。

纯操作：

| 名称 | 用途 | 条款 |
| --- | --- | --- |
| `project` | 按块的模型可读标注与有效压缩记录算出模型可读消息 | [RQ-03](../SPEC.md#rq-03-历史与块投影) |
| `projectForHuman` | 用同一套块标注规则给出人侧投影，不分页，不写回 | [RQ-03](../SPEC.md#rq-03-历史与块投影) |
| `assembleSystemPrompt` | 把有序段与变量渲染成纯文本，拒绝逐请求变化的变量 | [RQ-02](../SPEC.md#rq-02-组装的前置输入) |
| `declareTools` | 从完整工具定义形成直接集合与脚本可调用集合 | [RQ-02](../SPEC.md#rq-02-组装的前置输入)、[RQ-04](../SPEC.md#rq-04-模态与可追溯表示) |
| `placeContext` | 生成锚定的快照提醒与尾部易变提醒 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀)的 R4、R6 |
| `chooseRepresentations` | 为每个内容块选原件、派生表示、transcript 或待加载 | [RQ-04](../SPEC.md#rq-04-模态与可追溯表示) |
| `judgeBudget` | 比较完整候选与限制，给出装入裁定 | [RQ-05](../SPEC.md#rq-05-完整预算与候选完成) |
| `assemble` | 按七层拼装候选，附覆盖证据 | [RQ-02](../SPEC.md#rq-02-组装的前置输入)、[RQ-05](../SPEC.md#rq-05-完整预算与候选完成)、[RQ-07](../SPEC.md#rq-07-扩展修改发起与固定采用) |
| `planCompaction` | 装入裁定为需要压缩时给出计划：身份、步数上界、第一步 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| `deriveStep` | 按计划、进度与步结果推导下一步、压缩转换或装不下 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| `resume` | 共同提交之后带转换依据重算候选 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界)、[RQ-09](../SPEC.md#rq-09-取消恢复与迟到) |

前八项是单次计算，后三项是压缩计划的三步。全部是纯函数，见 [RQ-01](../SPEC.md#rq-01-调用方与计算边界)。

端口类型：

| 名称 | 用途 | 条款 |
| --- | --- | --- |
| `HistorySource` | 历史持有者实现的读口 `read`：输入历史依据、游标与字节预算，返回一页、epoch 已变、无资格或不可用 | [历史源读口与 epoch 视图](../SPEC.md#历史源读口与-epoch-视图) |
| 压缩策略端口 | 触发界线、保留预算、保留偏好、修剪优先与步数上界的可替换实现 | [RQ-06](../SPEC.md#rq-06-压缩共同结果与保护边界) |
| 表示策略端口 | 多种表示都可用时的选择，按模态排偏好顺序 | [RQ-04](../SPEC.md#rq-04-模态与可追溯表示) |

两个策略端口的类型名现在没有确定。默认实现与默认值归 [request-context](../../request-context/README.md)。计量端口与转换件结果端口是 Model 的类型，本成员只消费，见 [Model 档案与请求准备协议](../../../model/model-contract/SPEC.md#档案与请求准备协议)。

契约常量：

| 常量 | 内容 | 条款 |
| --- | --- | --- |
| 七层顺序 | 系统提示词、工具声明、历史头、上下文快照提醒、历史体、尾部易变提醒的先后 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀) |
| 快照锚点规则 | 锚定在完整读取时的模型可见历史尾部，不含本次新输入 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀)的 R4 |
| 前缀变化原因的取值 | 新的完整读取换了快照、系统提示词变了、工具集合变了、发生了压缩、扩展改写了已有内容、换了模型、无变化 | [七层装载布局与前缀](../SPEC.md#七层装载布局与前缀) |

常量的导出名现在没有确定。改变任何一项都是契约变更。
