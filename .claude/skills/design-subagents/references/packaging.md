# 模板、共享正文与两端生成

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
| `claude.yaml` | 原生 Claude frontmatter 片段；不包含 Markdown 正文 |
| 可选 `codex-adaptation.md` / `claude-adaptation.md` | 有来源和行为依据的模型适配段，追加到共享正文 |

这些源包文件不是可直接注册的原生角色。填完有意义的模板变量后生成目标文件；
模型适配的证据另用[适配记录](../assets/templates/model-adaptation.md)保留。
适配段不要承载新的权威、权限或职责。若无需适配，不创建空的适配文件。

[架构设计示例](../assets/examples/architecture-designer/)是已填写的中性源包，
可用于验证生成器和理解角色边界。它没有注册到项目 agent 目录，没有指定精确模型，
也没有经过 Claude/Codex 目标模型实测。具体写路径由派发任务提供。

## 生成与核对

使用 Python 3.12+ 与 PyYAML；本仓库已在锁定工具环境中提供。其他项目若无这些依赖，
可以手动按宿主官方格式生成，不必为了使用方法论安装工具。

以下命令从仓库根执行，先输出到 Git 忽略的暂存目录：

```sh
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/skills/design-subagents/assets/examples/architecture-designer \
  --output tmp/agent-preview
uv run --locked python .agents/skills/design-subagents/scripts/render_pair.py \
  --source .agents/skills/design-subagents/assets/examples/architecture-designer \
  --output tmp/agent-preview --check
```

Claude Code 也可执行同一工具，或用 `.claude/skills/design-subagents/` 下的镜像路径。
输出是 `.codex/agents/<name>.toml` 与 `.claude/agents/<name>.md`。名称和分派描述
必须相同；共享正文逐字相同，适配段允许不同。生成器用解析器处理 TOML/YAML，
安全编码正文，不做 shell 展开或执行模板内容。

工具检查必要字段、常见跨宿主字段误用、占位符、两端共享内容与生成结果一致性。
指定模型必须在随技能维护的宿主支持记录内，适配段必须绑定精确模型；记录更新
需要新的支持证据。工具不会联网刷新模型列表或替换一个未确认目标。
它是有限静态检查，不是完整宿主 Schema，也不判断提示语义或模型可用性。
它不调用模型、安装角色、改变全局配置或证明权限已生效。

新生成遇到不同内容的既存目标会拒绝覆盖；先在新暂存位置比较改动，再按任务授权
把明确变更集放到最终位置。`--check` 只读比较，不修复差异。两端文件不具有跨文件
事务提交保证，运行失败后检查实际输出；正式交付在一次可审阅变更中同步。

## 维护与发布

继续维护源包，修改时从源包重新生成并检查；不要只改某个输出文件后宣称两端一致。
如果已有项目使用 Claude 正文为源，也可沿用其维护方式，先提取共享职责再记录
模型适配差异，不强制迁移目录。方法一致不要求所有项目采用同一个生成脚本。

本仓库 skill 的 `.agents/skills` 与 `.claude/skills` 全部文件保持镜像；角色生成结果
由于宿主和模型适配差异，不适用逐字全文件镜像。不得混淆 skill 镜像与角色语义一致。

源包的保存和原生角色发布使用任务授权的位置。提示词生成完成后，仍需按目标宿主
进行发现/加载验证；新增文件不代表当前会话自动可调用。发布新角色或调整主力模型
不是运行本生成器的隐含动作。
