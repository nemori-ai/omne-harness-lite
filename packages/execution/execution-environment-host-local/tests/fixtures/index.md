# tests/fixtures 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [fake-supervisor.mjs](fake-supervisor.mjs)：假的 `systemd-run`（充当门：答 ready、started 与带一个成员的退出帧，记下 `retain`，留到被杀）与假的 `systemctl`（记下每次调用，`kill` 杀门进程，`show` 按 hold 文件答 `deactivating` 或 `inactive`），第一个参数选工具，一切都在 `FAKE_DIR` 里；可选的 `FAKE_DIR/gate.json` 改写门的脚本，门收到的控制命令记进 `control.log`；归 [host-command-custody.spec.ts](../host-command-custody.spec.ts) 与 [host-command-disposition.spec.ts](../host-command-disposition.spec.ts)，`systemctl` 也供 [host-terminal-frames.spec.ts](../host-terminal-frames.spec.ts) 使用
- [scripted-systemctl.mjs](scripted-systemctl.mjs)：假的 `systemctl`，按用例写进 `SCRIPT_DIR/replies.json` 的规则答复（`systemctl show` 的「键=值」行与退出码），并把每次调用的参数按 JSON 数组逐行记进 `calls.log`；归 [host-scope.spec.ts](../host-scope.spec.ts) 与 [host-provider.spec.ts](../host-provider.spec.ts)
- [fake-terminal-gate.mjs](fake-terminal-gate.mjs)：假的 `systemd-run`，充当终端门进程：读描述符 3 的控制通道，按 `FAKE_DIR/gate-script.json` 回帧（ready、opened、started、between、begun、data、finished、fault；`joined` 让一帧与前一帧同一次写入），记下收到的消息与自己的进程号；只守线上形状，不截断、不做哨兵归属；`systemctl` 用 `fake-supervisor.mjs`；归 [host-terminal-frames.spec.ts](../host-terminal-frames.spec.ts)
