# tests/fixtures 索引

本文件列出本目录的文件与阅读路径。职责说明见 [README.md](README.md)。

## 内容

- [README.md](README.md)：固定输入的来源与约束
- [fake-supervisor.mjs](fake-supervisor.mjs)：假的 `systemd-run`（充当门：答 ready、started 与带一个成员的退出帧，记下 `retain`，留到被杀）与假的 `systemctl`（记下每次调用，`kill` 杀门进程，`show` 按 hold 文件答 `deactivating` 或 `inactive`），第一个参数选工具，一切都在 `FAKE_DIR` 里；归 [host-command-custody.spec.ts](../host-command-custody.spec.ts)
- [scripted-systemctl.mjs](scripted-systemctl.mjs)：假的 `systemctl`，按用例写进 `SCRIPT_DIR/replies.json` 的规则答复（`systemctl show` 的「键=值」行与退出码），并把每次调用的参数按 JSON 数组逐行记进 `calls.log`；归 [host-scope.spec.ts](../host-scope.spec.ts) 与 [host-provider.spec.ts](../host-provider.spec.ts)
