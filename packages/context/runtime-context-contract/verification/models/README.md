# verification/models

本目录承载本包的形式模型，例如 TLA+、Alloy 或 SMT 模型。

## 允许的内容

模型源文件、配置与说明。

## 边界

说明模型对应的 `SPEC.md` 条款、抽象前提与未覆盖的部分。模型通过不等于实现符合。

## 维护

承诺或实现结构变化时，复核模型的抽象是否仍然成立。

## 本包事实

| 模型 | 检查什么 |
| --- | --- |
| [RcCommit.tla](RcCommit.tla) | RC-02 的先提交后应用、按 `after` 链定序、完整输入认回，以及成功去重表有界与已释放提交的拒绝（R2-D319） |
| [RcRead.tla](RcRead.tla) | RC-01、RC-03、RC-08、RC-09 的读取隔离、缓存一致与有界，以及持有者记住的作用域归属 |

配置名的前缀表示用途：`rc-` 是正控，`bad-` 是负控（只检查点名的一条性质），`probe-` 是按实现建模的探针。性质与源码对应见 [formal-mapping.md](../formal-mapping.md)，运行记录见 [formal-runs.md](../formal-runs.md)。

运行入口是 [run-tlc.sh](run-tlc.sh)。先把本目录复制到 WSL 自己的文件系统，再在登录 shell 里运行：

```sh
wsl.exe -d Ubuntu-24.04 --exec bash -l <WSL 里的副本>/run-tlc.sh <WSL 里的副本> <输出目录>
```

判读看每份日志的结论行，不看退出码本身。
