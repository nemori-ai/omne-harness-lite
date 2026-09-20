# 实现映射

这里保存契约由谁兑现：插件提供者的设计、应用装配的选择，以及把承诺绑到实际证据上的绑定表。

失效事件：实现换方案。需求没变、契约没变，但换了一个库、改了一处装配、
或上游语义变了导致原来的兑现方式不再成立——变化落在这里。

## 为什么提供者与装配在一起

把它们分成两个目录是很自然的想法，但两份入口的章节会逐条对应：新建或接续主题、
准入门槛与停止条件、当前主题，连停止条件的句式都一样。差别只有一处——
提供者回答「这个契约由哪个插件兑现」，装配回答「这个应用选了哪些提供者」。

这是同一种节点的两个 `kind`，不是两类知识。分开维护的代价是每条跨两者的动作链
都要在两个目录之间对照阅读，而动作链恰恰是最需要一眼看全的东西。

```text
realization/
├── .templates/node/
│   ├── README.md          节点入口与状态
│   ├── design.md          实现路径、投影、依赖与装卸责任
│   ├── bindings.yaml      条款到证据的绑定表
│   └── verification.md    符合性或集成证据的可变入口
├── packages/<node>/       产品包节点，kind: provider
└── apps/<node>/           应用装配节点，kind: assembly
```

`packages/` 与 `apps/` 对应实际源码归属，不是又一层分类。节点名与它实现的包或应用同名，
使「读设计」和「读源码」用同一个词。

## bindings.yaml

这是唯一能回答「设计承诺有没有实现证据」的地方。

```yaml
version: 1
node: local-harness
kind: assembly
bindings:
  - clause: "capability.live-agent/v1#S-7"
    basis:
      - async-control-not-bail
    evidence: "formal:live-agent-v1-progress"
    assumptions:
      - "Failures = FALSE：该进展性质只在无失败路径上检查"
    alignment_checked: 2026-09-16
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `clause` | 是 | 精确契约坐标加条款号 |
| `basis` | 否 | 该绑定依赖的[机制语义条目](../basis/README.md) |
| `evidence` | 是 | `test:<id>` 或 `formal:<task-id>`；后者指向 registry 的形式任务 |
| `assumptions` | 是 | 该证据成立的前提；无前提写空列表，不省略字段 |
| `alignment_checked` | 是 | 最后一次对着所引 basis 条目核对的日期 |

**`assumptions` 必填，因为多数生命周期与进展性质的证据都是有前提的。**
省掉它，一条「在无失败路径上成立」的检查会被读成无条件保证；
写出来，前提失效时责任方是明确的。

**两种证据形式都拿不出时，不新增一个「无法验证」的状态。** 那是把缺证据登记成已处理，
属于可解释的假成功。正确做法是退回把性质改写成有界形式；真退不回去，
由需求方裁决改写还是撤销。

### 两条可以机器判的检查

- **事件派发一致**：绑定声明了异步控制语义，而源码里用的是 `ctx.bail(`，直接失败。
  这类错误静态可查，而它造成的后果是**静默**的——授权检查返回 Promise，
  不被判为 bail 值，于是悄悄放行。
- **绑定复核过期**：`alignment_checked` 早于所引 basis 条目的 `checked`，
  该绑定进入待复核。这是上游变动传播到设计的唯一通路。

## 准入门槛与停止条件

- provider 节点必须给出精确能力契约、Cordis 插件边界、服务/贡献、依赖、资源、装卸责任、源码修订与符合性状态。
- assembly 节点必须定位实际应用、所选提供者和版本、配置/作用域、消费关系、完整动作链及真实集成证据或明确缺口。
- 只有机制候选时回 [proposals](../record/proposals/README.md)；源码或提供者不存在时如实记录实现缺口，
  不从文件名、接口形状或 mock 推断已兑现。
- 选择未发生时保持候选；整体保证缺少独立协调责任时回到能力分解，不能让装配胶水暗中拥有未定义能力。

命名、裁剪与跨目录引用遵循[信息包约定](../README.md#主题是信息包)。
模板自身不是实际主题；不要将 `.templates/` 中的候选占位符计入能力、决定或证据清单。

## 当前主题

| 节点 | kind | 消费契约 | 状态 |
|---|---|---|---|
| [account-identity](packages/account-identity/README.md) | provider | `capability.account-identity` v1 | 设计完成，未实现 |
| [tenant-governance](packages/tenant-governance/README.md) | provider | `capability.tenant-governance` v1 | 设计完成，未实现 |
| [account-registration](packages/account-registration/README.md) | provider | `composition.account-registration` v1 | 设计完成，未实现；形式检查已通过 |

三者的契约均为 candidate，尚无接受决定；「设计完成」不表示语义已被接受。

## 当前状态

账号与租户一组的三个节点已建，各含 `design.md` 与 `bindings.yaml`。
存量节点尚未从 `design_legacy/providers/` 与 `design_legacy/assemblies/` 迁入。

**尚无 assembly 节点**：本项目还没有应用装配入口，`apps/` 为空。

判断方法按需读 `harness-design-handbook` skill 的「插件投影」。
返回[设计链入口](../README.md)。
