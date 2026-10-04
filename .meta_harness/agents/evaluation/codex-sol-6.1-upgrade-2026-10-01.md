# Codex 一端 GPT-6 Sol 升为 GPT-6.1 Sol（2026-10-01）

本记录保存一次模型钉值替换的依据与验证范围。角色的现行定义以[角色源包](../roles/README.md)为准，
宿主支持的现行事实以[支持记录](../skills/design-subagents/canonical/references/model-support.json)为准。

## 改了什么

负责人 2026-10-01 定：Codex 一端凡是用 `gpt-6-sol` 的，统一换成 `gpt-6.1-sol`。

| 位置 | 改动 |
|---|---|
| verification-developer、tui-developer、tui-qa、tui-debugger 的 `codex.toml` | `model` 由 `gpt-6-sol` 改为 `gpt-6.1-sol` |
| verification-developer、tui-developer、tui-qa、developer 两端的 description | 「Codex GPT-6 Sol」改为「Codex GPT-6.1 Sol」 |
| [roles/README](../roles/README.md) 与[角色合一记录](role-merge-2026-10-01.md)里 developer 的模型选法表 | Codex 一列同步 |
| 支持记录、[支持核对说明](../skills/design-subagents/canonical/references/model-support.md)、[OpenAI 模型指导](../skills/design-subagents/canonical/references/openai-models.md)、来源索引 | 补 GPT-6.1 Sol 的目录、调用与官方指导核对结果 |

档位、权限、提示正文与用 GPT-6 Astra 的角色都没动。Codex 目录里 6.1 一代只有 Sol，没有 6.1 的 Astra。

## 依据

| 事实 | 出处 |
|---|---|
| Codex 目录列出 `gpt-6.1-sol`，档位 low 到 ultra | `codex-cli` 0.159.0 运行后的 `models_cache.json`，取于 2026-10-01T08:50:07Z，摘要见支持记录 |
| 本账户能实际调用 | `codex exec -m gpt-6.1-sol`、high，返回预期的一个词，无「缺少模型元数据」之类的告警 |
| 服务端不是来者不拒 | 同一会话里编造的 `gpt-6.1-doesnotexist` 被 400 拒绝 |
| 旧客户端看不到它 | 同一台机器上编辑器扩展自带的 0.155.0 写出的目录不含这个模型 |
| 官方定位 | [Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model.md#gpt-6.1-sol) 把 GPT-6.1 Sol 列为现行的 Sol 档，并给了从 `gpt-6-sol` 迁移的提示 |
| 没有专属提示指南 | `latest-model/gpt-6.1-sol.md` 不存在；家族页的提示建议写明针对的是 Astra 上观察到的行为 |
| 与 GPT-6 Sol 的一处接口差异 | 6.1 Sol 不支持 `none`、`minimal` 推理档；本工作区的角色最低用到 medium，不受影响 |

## 验证了什么，没验证什么

| 项 | 状态 |
|---|---|
| 生成器接受新钉值（支持记录是准入门），两端 description 一致 | 已核（`make agents-check`） |
| 目录可见、账户可调用 | 已核，各一次 |
| 钉了新模型的角色在 Codex 新进程里被派发，角色文件的钉值生效 | 已核一个：父会话跑在 `gpt-6-luna` 上、派发 verification-developer 时不给模型；子会话的 rollout 日志里 `agent_role` 为 `verification-developer`、模型 `gpt-6.1-sol`、档位 `high`。三个 TUI 角色用的是同一种钉法，没有逐个派发 |
| 换模型后各角色的任务质量不比 GPT-6 Sol 差 | **未验证**：没有跑留出任务对照。GPT-6 Sol 当初换上去时 Codex 一端同样没有任务质量对照（见[换代记录](role-model-reeval/README.md)），description 里「与顶档相当」的说法出自 [Claude 一端的 Sonnet 5.5 对照](role-model-sonnet55/README.md)，不是 Codex 的实测 |

出现下面任一情形时回头看这次替换：这四个角色在 Codex 上的交付出现此前没有的越界或漏验；
目标机器的 Codex 客户端低于能列出该模型的版本（已知 0.155.0 不行、0.159.0 可以，中间版本未核）。
回退只需把四处 `model` 改回 `gpt-6-sol` 并重编，支持记录里旧条目仍在。
