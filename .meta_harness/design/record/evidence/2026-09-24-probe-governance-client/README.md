# 治理客户端候选的隔离探针 · 2026-09-24

这次实际执行验证两个可独立推进的机制，不代表 CLI 已实现或生产准入。

| 输入与环境 | 实际结果 | 原始记录 |
|---|---|---|
| Node 24.21.0，macOS arm64，合成 TLS 对端；CA/主机名及 SPKI、单次 HTTP 请求和 health 读取 | 10 场景通过：错误 CA/主机名/pin 时对端收到应用字节数为 0；正确信任可读 health；精确版本字节先于 503 分类；非精确版本字串、302、截断体、其他路由成功形状均拒绝 | [脚本](client-transport-probe/probe.mjs)、[结果](client-transport-probe/result.json) |
| Node 24.21.0 / SQLite 3.53.4，macOS arm64 | 四进程相同 revision 竞争恰一个提交；DB/WAL/SHM 均 0600、目录0700；杀掉持未提交事务的进程后旧值保留且新进程可提交 | [脚本](client-state-probe/probe.mjs)、[结果](client-state-probe/result.json) |
| 同一脚本，Linux arm64 Docker 容器，网络禁用、输入只读挂载 | 上述三个场景通过 | [原始输出](client-state-probe/linux-result.log) |

Linux 镜像固定为 `node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`（24.21.0-bookworm-slim）。容器只拷贝探针到自己的 `/tmp` 运行，退出即删除；没有连接现有服务。macOS 使用逐命令 `fnm exec --using 24 node`，没有改默认 Node。

## 可复现性与修订

TLS 探针原始路径为仓库 `tmp/production-cli-onboarding/client-transport-probe/probe.mjs`，复用了既有 e2e 的证书生成助手；复现时将本包脚本复制回同样深度的临时目录（独占新目录亦可，修正助手 import），以 Node24 执行。助手只生成合成证书，探针不调用其中心启动功能。助手精确哈希见 manifest。

本地状态脚本独立可运行，在临时目录放副本执行；Linux 命令为 `docker run --rm --network none --mount type=bind,source=<脚本目录>,target=/probe,readonly <上述镜像> sh -c 'cp /probe/probe.mjs /tmp/probe.mjs && node /tmp/probe.mjs && cat /tmp/result.json'`。脚本使用独占临时目录；同名 result.json 在该脚本目录写入，复现不要覆盖本包证据。

`client-state-probe/run-1/` 保留首轮输入与输出。首轮 Linux 报告的 limits 错误继承了固定文字“No Linux execution”，但结构化 platform 实际为 linux；已修正为“仅覆盖本次进程所在平台”并重新执行两平台，当前文件为第二轮。首轮结果没有被覆盖。

## 不能据此声称的事

- TLS 是合成对端，未调用生产中心；结果解析仅覆盖公开 health，不是27条路由完整 codec。未做完整 HTTP 模糊测试或 TLS 降级验证。
- 本地探针没有注入 fsync 错误、物理断电、路径替换或同 UID 恶意进程；没有证明本地秘密保护政策完整。
- SQLite 机制候选未接受；不存在已交付的生产 CLI/TUI。Linux 容器不是两台独立员工电脑或真实终端 IME 证据。
- 私钥保留在原运行临时目录，未复制入本包。测试字符串是显式合成占位，不是真实登录凭据。

`manifest.json` 登记源文件哈希；在本目录执行 `shasum -a 256 -c SHA256SUMS` 校验证据。
