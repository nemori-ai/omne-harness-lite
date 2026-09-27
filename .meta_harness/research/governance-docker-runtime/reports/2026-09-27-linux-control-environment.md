# Linux 控制环境、真实 timer 与双端 TLS 前提

V0-c 单次完整先导成功，支持以后验证 Docker 运维入口所需的环境前提。运行于 macOS arm64／Docker Desktop Linux VM；控制容器与私有 DinD 隔离，未把用户实际 Docker socket 挂入控制容器，未重启或重配用户 daemon。不是产品 helper、SQLite 排他或物理断电验收。

## 实际取得的事实

- 控制环境为 root、PID1 systemd 252.39，私有 Docker CLI／Engine 均 29.1.3。官方 Linux AArch64 Compose 2.40.3 asset 与官方 checksum 同为 `d26373b19e89160546d15407516cc59f453030d9bc5b43ba7faf16f7b4980137`，实际容器内 version 为 v2.40.3。取得 URL、命令、ELF 和版本检查随原件保留。
- 同一 Linux named volume 在控制容器、DinD 和两个内部 UID10001 进程中是同一绝对路径；四方目录 inode 147735、owner10001、mode0700 一致，彼此能看见写入 marker。它不证明产品数据库 owner-lock 正确。
- 真实 systemd timer 对既有内部容器执行命令。目标运行时 service success；显式停目标后 service exit1；停私有 daemon 后 service exit1。每格核新的主进程开始／退出单调时间及 timer trigger。后两格 marker 不变、目标或 daemon 未复活。只是环境测试 unit，不是最终产品备份 unit。
- 一次性 CA／SAN localhost 和 127.0.0.1 证书下，Linux 与 macOS curl 都校验 TLS 并得到同一测试正文；Mac 不带测试 CA 时 exit60。未使用 insecure，不向系统信任库安装 CA，不验证用户公司的 DNS／证书。
- 两容器、三卷、一网络都删除成功，标签残留查询为空；固定派生控制镜像缓存和本地可重跑输入保留。

## 失败也保留

V0 在控制镜像缺 jq/curl/openssl 时停止；V0-b 取得 Debian bookworm 官方包后通过 systemd／私有 CLI 连通，却在把 tar 经 docker cp 写入 DinD `/tmp` 后无法从该路径 load，停在这里并清理。未实证该失败的根因，不把它解释为 Docker 保证。DinD 缓存自带 Compose5.0.0 也不符合本次固定版本。

V0-c 改用前次 V2d 已成功的 stdin streaming load，并独立取得 Compose2.40.3；源 tar config digest 与外层 ID 匹配，内层 ID 表示不同，改核 RootFS.Layers、OS 和架构。两个 ID 都原样记录，不强行说字符串相等。TLS tmpfs 文件使用目标进程内 tee/cat，不再依赖前述 `/tmp` 复制路径。

[32 件脚本、输入和原始结果](../sources/2026-09-27-linux-control-environment.tar.gz) · [逐文件摘要](../sources/2026-09-27-linux-control-environment.sha256.json)。最终脚本 SHA256 `b4384bf1a82e8e5f91dcdb53a389869f0931980eda74284e1cb1033d409cc717`；123 条命令原始结果 SHA256 `a2fe0a5bd947e642de8fb8ec07dff59d8f5b9ba119a803516f282695dca9be06`。归档保留早期失败；镜像 tar／可执行二进制不重复入库，精确身份、官方取得地址和 hash 随清单保留。换 systemd、Engine、Compose、卷布局或宿主后，需要重新取得这些环境事实。
