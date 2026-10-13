# 模板、共享正文与宿主生成

## 目录

- [输入资产](#输入资产)
- [生成与核对](#生成与核对)
- [维护与发布](#维护与发布)

## 输入资产

[agent-pair 模板](../assets/templates/agent-pair/)是一份可复制的角色源包：

| 文件 | 用途 |
|---|---|
| `role.md` | 两端共同职责、行动边界、必要输入、停止与返回约定 |
| `codex.toml` | 原生 Codex 配置片段；不包含 `developer_instructions` |
| `cursor.yaml` | Cursor 原生配置，由独立 projector 验证；字段与资格见 [Cursor](cursor.md) |
| `claude.yaml` | 原生 Claude frontmatter 片段；不包含 Markdown 正文 |
| 可选 `codex-adaptation.md` / `claude-adaptation.md` | 有来源和行为依据的模型适配段，追加到共享正文 |
| 可选 `assembly.toml` | 声明要内联的共同提示词及可调整的默认 effort；属于生成源配置，不是宿主字段 |

这些源包文件不是可直接注册的原生角色。填完有意义的模板变量后生成目标文件；
模型适配的证据另用[适配记录](../assets/templates/model-adaptation.md)保留。
适配段不要承载新的权威、权限或职责。若无需适配，不创建空的适配文件。

多个角色共用品味、行动契约等正文时，可在各自的 `assembly.toml` 声明：

```toml
shared_prompts = ["../engineering-taste.md", "../developer-contract.md"]
default_effort = "high"
```

两个字段均可省略。`shared_prompts` 是非空、元素互异的有序数组，每项相对当前源包，
必须是角色集合（源包父目录）内的 Markdown 文件；空数组、重复项、越界路径、
逃逸符号链接、缺失内容或未填写占位符使生成失败，单数形式的旧字段按未知字段拒绝。
生成顺序为 `role.md`、按声明顺序的各共同提示词、可选模型适配段；共同提示词被完整内联，接收者
无需再次读取源文件。将这些正文写成直接面向执行者的指令，维护说明放在 README 或
验证记录中。派发模板属于本次任务输入，不纳入固定提示词；不递归展开任意文档链接。

`default_effort` 仅接受 medium/high/xhigh。启用时，两端源配置不得另设 effort，
description 必须以生成器的 `effort_description()` 所定义的默认值和可调整说明结尾。
Codex 输出省略强制 effort，派发者必须显式传入所选值；Claude 文件输出默认 effort，
调整时使用会话级定义覆盖。两种宿主机制不同，不能靠修改提示词开启推理档位。

[架构设计示例](../assets/examples/architecture-designer/)是已填写的中性源包，
可用于验证生成器和理解角色边界。它没有注册到项目 agent 目录，没有指定精确模型，
也没有经过 Claude/Codex 目标模型实测。具体写路径由派发任务提供。

## 生成与核对

使用 Python 3.12+ 与 PyYAML；由任务选择已具备这些依赖的解释器或工作区工具环境。
以下 `python` 表示该解释器。没有依赖时可以手动按宿主官方格式生成，不必为了使用方法论安装工具。

从当前 skill 的实际包根执行：维护源是 `canonical/`，分发包则是宿主发现的 skill 目录；
先解析实际路径，不根据 shell/Git 根猜位置。输出使用任务指定的绝对路径：

```sh
python scripts/render_pair.py \
  --source assets/examples/architecture-designer \
  --output /absolute/path/to/agent-preview
python scripts/render_pair.py \
  --source assets/examples/architecture-designer \
  --output /absolute/path/to/agent-preview --check
```

Codex 与 Claude Code 的分发包都包含同一工具及支持记录。
输出是 `.codex/agents/<name>.toml` 与 `.claude/agents/<name>.md`。名称和分派描述
必须相同；共享正文逐字相同，适配段允许不同。生成器用解析器处理 TOML/YAML，
安全编码正文，不做 shell 展开或执行模板内容。

工具检查必要字段、常见跨宿主字段误用、占位符、两端共享内容与生成结果一致性。
指定模型必须在随技能维护的宿主支持记录内，适配段必须绑定精确模型；记录更新
需要新的支持证据。工具不会联网刷新模型列表或替换一个未确认目标。
它是有限静态检查，不是完整宿主 Schema，也不判断提示语义或模型可用性。
它不调用模型、安装角色、改变全局配置或证明权限已生效。

带有 `default_effort` 的角色还可只读生成本次派发设置：

```sh
python scripts/render_pair.py \
  --source /absolute/path/to/role-collection/adjustable-role --dispatch codex --effort high
python scripts/render_pair.py \
  --source /absolute/path/to/role-collection/adjustable-role --dispatch claude --effort high
```

省略 `--effort` 时使用源配置默认值。Codex 输出角色、模型和 reasoning_effort，供支持
这些参数的具名角色派发调用使用；Claude 输出完整 `--agents` JSON，包含未改动的正文、
模型和权限，只调整本次 effort。工具不执行派发，不改共享角色文件，不自动为当前
会话加载角色，也不承诺组织策略允许所选模型或档位。没有声明可调整默认值的固定
角色拒绝此接口，避免改变原有配置语义；上述路径须替换为实际存在的源包。

新生成遇到不同内容的既存目标会拒绝覆盖；先在新暂存位置比较改动，再按任务授权
把明确变更集放到最终位置。`--check` 只读比较，不修复差异。两端文件不具有跨文件
事务提交保证，运行失败后检查实际输出；正式交付在一次可审阅变更中同步。

## 维护与发布

继续维护源包，修改时从源包重新生成并检查；不要只改某个输出文件后宣称两端一致。
如果已有项目使用 Claude 正文为源，也可沿用其维护方式，先提取共享职责再记录
模型适配差异，不强制迁移目录。方法一致不要求所有项目采用同一个生成脚本。

本 skill 的唯一维护源、宿主策略与集中编译位置见[工作区上下文](workspace-context.md)。
两端 copy 策略使 skill 运行资源逐字节一致；角色生成结果由于宿主和模型适配差异，
不适用逐字全文件镜像。不得混淆 skill 镜像与角色语义一致。

源包的保存和原生角色发布使用任务授权的位置。提示词生成完成后，仍需按目标宿主
进行发现/加载验证；新增文件不代表当前会话自动可调用。发布新角色或调整主力模型
不是运行本生成器的隐含动作。

Cursor 使用执行仓库的集中 compiler，共享 role_source 的装配函数，不调用 pair renderer 取得正文。只有选择旧宿主时才要求成对配置完整。Cursor-only 源可独立构建；无 Cursor 配置的旧 pair 示例仍只能作为旧宿主示例使用。
