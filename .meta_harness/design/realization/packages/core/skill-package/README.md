# skill-package

- kind：`provider`
- 对象与设计修订：状态 `accepted`，2026-09-25 首稿（按 [D-040 §八 M41](../../../../record/decisions/mainline-self-rulings-2026-09/decision.md#八实现映射起草反推出的契约修订m31m442026-09-25-追加) 一契约一包）；兑现 `omne-harness-lite-design-2026-09-15 · data.skill-package · v1`（[契约](../../../../spec/data/skill-package/v1/contract.md)，状态 `accepted`，接受由 [D-041](../../../../record/decisions/assets-runtimes-contract-acceptance/README.md)）
- 源码位置：`packages/core/skill-package`——**尚未建包**。归 `core`：它是 `data.*`，被 `assets`、`tools`（注册表、执行运行时的 `Skills()`）与斜杠命令消费
- 契约采用与边界依据：本节点是**纯模块，不是 Cordis 插件**——契约没有操作与提交点；`SKILL.md` 的读法是纯函数（[第五节](../../../../spec/data/skill-package/v1/contract.md#五装配给与协议给)「文本形式的读法」一行：不变）。它提供技能包的类型、`SKILL.md` 的文本读法、目录形式读法的纯半、表示层校验、依赖声明与属性项投影、asset-model 的 `skill` 类正文端口。**读目录与解析符号链接、运行脚本都不在这里**

## 分层状态

- 语义接受范围：**设计已接受**（2026-09-26，[D-042](../../../../record/decisions/assets-runtimes-node-acceptance/decision.md)；契约接受由 D-041 登记）。接受的是设计与显式缺口；可实施范围、绑定与实际验证各层沿用下列记录。
- 可实施范围：声称兑现 S-1～S-25、S-32 的形状、文本形式读法、目录形式读法的纯半、表示层面与推出规则。**不兑现**：S-21 第 4 条符号链接的解析（读目录的一方判）、S-10 与 S-11 的运行入口（执行运行时）。逐条见 [design.md 投影表](design.md#契约责任--模块公开入口--实现--符合性依据或缺口)。源码不存在，以上**全部未实现**
- 绑定与证据：[`bindings.yaml`](bindings.yaml) **为空表**——契约没有登记的 formal task；源码不存在。证据义务见 [verification.md](verification.md)，全部未开始
- 实际验证：**无**（源码不存在）

## 按当前问题展开

| 当前问题                                   | 阅读入口                            |
| ------------------------------------------ | ----------------------------------- |
| 怎样实现、`SKILL.md` 怎样定界、YAML 怎样读 | [实现设计](design.md)               |
| 哪条承诺由哪份证据支持、前提是什么         | [绑定表](bindings.yaml)（当前为空） |
| 要跑什么、谁来跑、还缺什么                 | [验证与证据](verification.md)       |

状态变化由实际事件驱动。文件存在、接口齐全或评审无意见都不提升状态；
契约语义变化回 [spec](../../../../spec/README.md)，采用选择回 [record/decisions](../../../../record/decisions/README.md)。
