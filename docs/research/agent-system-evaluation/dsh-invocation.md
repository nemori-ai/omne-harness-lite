# DSH 评测入口与实际调用补充

本页补充[框架调查](frameworks.md#dsh)的执行证据。性质仍是研究，不代表本项目
采用了 DSH 的 Agent Loop、完整 Harness 或 Python SDK。执行日期：2026-09-12。

## 目录

- [实际调用了什么](#实际调用了什么)
- [调用结果与覆盖边界](#调用结果与覆盖边界)
- [怎样复现](#怎样复现)
- [真实模型评测还差什么](#真实模型评测还差什么)
- [对评测设计的补充认识](#对评测设计的补充认识)

## 实际调用了什么

上一轮只核对了官方文档、源码和工作流。本次在仓库外的独立 Python 虚拟环境中
安装发布包，执行官方 `smoke-python-runtime.py` 的三个场景。实际链路是：

```text
官方 smoke 脚本
  → Python DeepSeekHarness SDK
  → wheel 内的原生 DSH 运行时
  → JSON-RPC 初始化、session/prompt 与运行事件
  → 本机 HTTP 服务返回预设的文本或工具调用
  → DSH 实际执行工具，将结果送回本机服务
  → 返回结果、会话落盘、官方断言与快照比较
```

本机服务复用官方 `MockModel`。它替代的是模型响应；SDK、运行时、工具执行和
会话持久化是真实执行。本次没有真实模型推理，也没有向 OpenRouter 或 DeepSeek
发送模型请求。[官方 smoke 实现](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/scripts/smoke-python-runtime.py)

| 对象 | 本次固定条件 |
|---|---|
| 测试源码与快照 | DSH `c291e7961a515f6d7af9304e7fd1d257929aef26` |
| SDK / 原生运行时发布包 | `deepseek-harness-sdk==0.1.5rc1` / `deepseek-harness-runtime-bin==0.1.5rc1` |
| 本地环境 | Linux x86_64、Python 3.12.13、uv 0.11.24 |
| 配置与任务目录 | 官方脚本逐场景创建独立临时 workspace 与 DSH home |
| 执行限制 | 每个场景外层超时 120 秒；未修改测试、断言或黄金快照 |

测试源码版本与被测发布包版本分别记录。运行时内嵌元数据仍写 `0.0.0-dev`，
不能据此把 wheel 归属于上述 Git 提交；本次没有建立该构建来源映射。可核对的
分发版本、发布 wheel 哈希、已安装二进制哈希、测试文件哈希和全部依赖版本均见
[执行记录](evidence/dsh-sdk-smoke-2026-09-12.json)。发布来源见
[PyPI SDK 元数据](https://pypi.org/pypi/deepseek-harness-sdk/0.1.5rc1/json)与
[运行时元数据](https://pypi.org/pypi/deepseek-harness-runtime-bin/0.1.5rc1/json)。

## 调用结果与覆盖边界

| 官方场景 | 实际结果 | 该场景检查什么 |
|---|---|---|
| `sdk-default` | PASS，退出码 0 | 默认 SDK 完成一轮，返回约定文本，生成符合脚本断言的压缩会话日志 |
| `sdk-minimal` | PASS，退出码 0 | 连续两次真实 shell 调用保留计数器和工作目录；JSONL 包含两次输出；模型可见内容与既有快照一致 |
| `sdk-custom` | PASS，退出码 0 | 通过 patch 定制配置；同一 session 连续完成普通文本、`run_code` 和 `workflow` 三轮；日志包含各轮结果 |

这里的续接是在同一 SDK 实例及运行时进程内完成；没有验证进程重启后的恢复。
`sdk-custom` 的 workflow 场景计算固定值，没有启动子 agent。

三个场景的 stdout 均为官方 `… passed`，stderr 为空，完整退出记录已落盘。
记录中的耗时只是这台机器上的单次运行观察，不是经过校准的性能 benchmark。
官方脚本退出时清理临时 workspace 和会话日志，因此本次保留了版本、源码哈希和
进程结果，没有保留原始 session trace。

**这三项通过只说明指定条件下调用机制成立。** 它不说明模型能够自主选对工具、
完成复杂任务，也不覆盖长会话压缩、租户隔离、动态卸载、长稳运行或性能 CI 预算。
没有执行官方 `all` 场景，也没有把这次运行计为智能任务成功率。

## 怎样复现

以下命令面向本次 Linux x86_64 环境，依赖现有 uv、Git 和网络。所有安装及执行
均位于新建的系统临时目录；原仓库的 workspace 和锁文件不参与。三个命令分别
执行，任一失败即停止。执行前保持 `PYTHONPATH`、`DSH_RUNTIME_MODE` 未设置，
这是官方 `--installed-wheel` 对发布包测试环境的要求。

```bash
set -eu
dsh_probe_root=$(mktemp -d /tmp/omne-dsh-repro-XXXXXX)
git clone --no-checkout https://github.com/deepseek-ai/deepseek-harness.git "$dsh_probe_root/upstream"
git -C "$dsh_probe_root/upstream" checkout --detach c291e7961a515f6d7af9304e7fd1d257929aef26
uv venv --python 3.12.13 "$dsh_probe_root/venv"
uv pip install --python "$dsh_probe_root/venv/bin/python" \
  deepseek-harness-sdk==0.1.5rc1 deepseek-harness-runtime-bin==0.1.5rc1 \
  pydantic==2.13.5 pydantic-core==2.46.5 annotated-types==0.8.0 \
  typing-extensions==4.16.0 typing-inspection==0.4.4
cd "$dsh_probe_root"
timeout 120 "$dsh_probe_root/venv/bin/python" "$dsh_probe_root/upstream/scripts/smoke-python-runtime.py" --installed-wheel --scenario sdk-default
timeout 120 "$dsh_probe_root/venv/bin/python" "$dsh_probe_root/upstream/scripts/smoke-python-runtime.py" --installed-wheel --scenario sdk-minimal
timeout 120 "$dsh_probe_root/venv/bin/python" "$dsh_probe_root/upstream/scripts/smoke-python-runtime.py" --installed-wheel --scenario sdk-custom
```

本次实际执行使用同一提交的按需下载文件，并由 Python `subprocess.run` 设置
外层超时；上面的完整检出与 `timeout` 是便于独立复现的等价准备方式。没有使用
`--update-snapshots`。按需下载时，除脚本外还需要会话格式源码和 minimal 快照，
具体路径及哈希已在执行记录中列出。

## 真实模型评测还差什么

当前进程没有注入 OpenRouter API 凭据，故没有执行付费模型评测。官方 SDK
允许指定模型、兼容 API 地址与凭据，并用显式 workspace、home 和 session
组织任务；这提供接入外部评测器的调用边界，不提供完整 benchmark 任务集。
[官方 SDK 指南](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/docs/user/guide/python-sdk.md)

另一个值得补入调查的官方场景是 `sdk-live`：第一轮要求模型用工具创建具有精确
字节内容的文件；测试进程随后用随机内容从外部覆盖它；第二轮让模型根据前轮
上下文找到文件，把现有内容复制到新路径。验证同时核对结束原因、工具调用、
完成回复、目标文件字节和源文件未被破坏。随机内容没有出现在提示中，所以仅
复述前轮答案或输出成功声明不能通过。这是源码观察，本次没有执行此场景。
[两轮真实模型 smoke 与独立验证](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/scripts/smoke-python-runtime.py#L868)

后续在本项目做真实调用时仍须统一经 OpenRouter，并记录实际模型、提供者和
路由条件。上述官方 `sdk-live` 固定了 DeepSeek 模型标识；只换 API 地址不能
证明 OpenRouter 的模型命名、请求字段与响应语义已经兼容，需以实际选定模型
做单独适配验证。当前没有声称这条兼容链路已经通过。

## 对评测设计的补充认识

DSH 把两类证据分开处理：预设响应让调用机制可重复验证；真实模型任务再检验
自主行为是否产生了正确结果。后者使用独立生成的外部状态，可以排除一部分
“只是猜中答案或重复旧上下文”的假成功。这一分工比把所有测试都改为模型评分
更值得借鉴。

这次调用补足了报告中“SDK 可作为评测接入入口”的本地执行证据；它没有重现
DSH 的性能门禁实验，也没有提供可用于模型升版或框架排名的质量成绩。后续
如何将产品评测正式纳入仓库，仍沿[报告的候选讨论](README.md#当前仓库的边界与后续讨论)
推进，不改变现有开发模型评估目录的职责。
