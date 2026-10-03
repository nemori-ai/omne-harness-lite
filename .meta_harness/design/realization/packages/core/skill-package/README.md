## 最终 core 阶段签收（2026-09-26）

本节点本阶段的 15 项本地／组合责任已由主调度按精确坐标签收；全程221/221（六混合项仅NonConnector部分），U1另13项。
Skill默认入口采用3，AM3／AE3／Slash2仍以真实2正文端口判定；其他节点采用不变。
[新原始运行与逐项签收](../../../../record/evidence/2026-09-26-tests-core-skill-v3/README.md)记录6534项适用回归、54项Skill独立检查、真实20制品消费，以及22包57个双语公开示例。
产品负责人已授权Skill收尾后总体发布／squash merge／清理；该条件已满足。源码复验坐标00999722，原06b运行与唯一SA测试坐标修复的适用性逐文件记录。
下文旧日期／旧源的“未签／SP3／未完成／人的总体门待签”保留为当时事件，当前core阶段状态由本段取代。外部owner、真实运行时／IO、Connector和生产就绪没有提升；全仓make的三个main继承失败仍保留。

## D069当前采用与实施中（2026-09-26）

本节点已接受[Skill3](../../../../spec/data/skill-package/v3/contract.md)及[本次提供者投影](design.md#d-069skill3-已接受采用2026-09-26)，依据[D069技术接受](../../../../record/decisions/skill-yaml-key-resolution/acceptance.json)；默认3读入／纯值与保留2纯值／正文／完整Schema边界见design。本轮实现升级与新15项core义务正在实施，不能把此前11项2签收重标3。旧2 SP3和原4项未签结论仍是原输入的真实记录，当前3策略已有答案但实际证据须新跑。

下文原2实现／技术接受按原日期与坐标读取，由本段当前采用取代其“当前2”口径；不否认原结果。

# skill-package

## 当前 core 交付与技术接受（2026-09-26）

- 语义采用：`data.skill-package/v2`；规范接受与冻结依据仍归 registry／原决定，本次不修改其语义。
- 源码与公开面：`packages/core/skill-package` 已实施，实际复验源为 HUB `a53644ad`。公开操作、Cordis 服务及外部 owner 边界仍由 [design.md](design.md) 定义。
- 本节点实际回归：**406 项通过，零失败、零跳过**；同源完整构建／严格类型、27 条源码规则以及实际20包的500类型／21 JSON入口／139×2私有路径拒绝通过。[原始执行、制品与范围](../../../../record/evidence/2026-09-26-tests-core-final/README.md)。
- 逐项技术接受：本节点 8 项 core-local、3 项 core-composition 的本阶段责任已经主调度接受；[精确 ID、坐标和前提](../../../../record/evidence/2026-09-26-tests-core-final/technical-acceptance.json)。Connector 混合项只接受当前 NonConnector 部分，原整条及延期部分未签。
- 分层限制：纯函数／显式输入与真实 core 组合分别按上述证据读取；外部事实、整个共享 CS、实际 transport／执行／存储宿主及人的总体接受未被提升。全仓 `make check` 因继承 main 的三个租户迁移测试失败而退出2，诊断及同源基线原件在同run，不能声称全仓门已通过。
- 未闭合：`skill-package.markdown-yaml`、`skill-package.normalized-package`、`skill-package.walkthrough-cs-3-core-step`、`skill-package.walkthrough-cs-6-core-step`。未知 YAML 自定义标签键的 canonical 判等仍为 SP3，普通已确定输入通过不等于完整 S20／CS6；不将 `undetermined` 偷改为 `malformed`。

## 既有设计入口与此前状态记录

以下执行状态按原日期与输入读取；与当前进度有关的旧“源码不存在／未开始／W6待验”已由上面的实际事件取代，原规范义务和外部边界仍保留。

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-060 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.skill-package · v2`（[契约](../../../../spec/data/skill-package/v2/contract.md)，状态 `accepted`，接受由 [D-061](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/skill-package`——**尚未建包**。归 `core`：它是 `data.*`，被 `assets`、`tools`（注册表、执行运行时的 `Skills()`）与斜杠命令消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点；`SKILL.md` 的读法是纯函数（[第五节](../../../../spec/data/skill-package/v2/contract.md#五装配给与协议给)「文本形式的读法」一行：不变）。它提供技能包的类型、`SKILL.md` 的文本读法、目录形式读法的纯半、表示层校验、依赖声明与属性项投影、asset-model 的 `skill` 类正文端口。**读目录与解析符号链接、运行脚本都不在这里**

## 分层状态

**当前实施补充（2026-09-26）**：源码已进入 HUB，公开数据／正文端口可以消费；下列原始「源码不存在／未开始」条目是设计接受时基线，待实际证据逐项登记更新。文本读入的自定义 scalar 标签键等价仍有 [SP-3](design.md#实施缺口与消费者影响) 实现缺口；读入返回显式 `undetermined`，目录读入也传播此分支，不能称整个模块已经完成验收。

- 语义接受范围：**设计已接受**（2026-09-26，[D-062](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-061 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-25、S-32 的形状、文本形式读法、目录形式读法的纯半、表示层面与推出规则。**不兑现**：S-21 第 4 条符号链接的解析（读目录的一方判）、S-10 与 S-11 的运行入口（执行运行时）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、`SKILL.md` 怎样定界、YAML 怎样读 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（含当前有限测试绑定） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。

## 2026-10-03 固定Schema技术采用

[D-116](../../../../record/decisions/fixed-schema-precompile/README.md)与[本节点固定图装配](fixed-schema-precompile-design.md)补充现行设计。只改变固定图编译/装载时机；本机制实施、实际绑定与验证未完成，原契约和历史run的状态不据此改写。

## 2026-10-03 D-116 主体实施与有限验收

本节点固定图已实施构建期生成与首次实际消费时的同步原生装载。全部定义、公开结果/errors、构建失败清理、恢复、新鲜性及制品消费的实际范围见[主体原始运行与有限签收](../../../../record/evidence/2026-10-03-tests-fixed-schema-main/README.md)。本段取代上文 D-116 补充中关于固定图实施/验证尚待的状态；原契约、其他能力与历史运行的边界不变。
