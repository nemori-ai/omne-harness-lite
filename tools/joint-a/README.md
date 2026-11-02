# 联调 A 的判据脚本

本目录放联调 A（`backward-plan.md` §4.6）的两份判据脚本。它们按 `slices.md` 的步骤代号写，
在联调轨道头上运行，输出写进证据目录。

| 入口 | 判据 | 步骤 |
| --- | --- | --- |
| [end-to-end.mjs](end-to-end.mjs) | S0 骨架：插件树装载、S1 T1–T3 建租户、登录、建会话、发输入、S2 E1 单轮纯消息 | S0-1、S0-2、S0-3、S0-4、S1-1、S1-2、S1-3、S1-4、S2-1、S2-2、S2-3 |
| [refusal.mjs](refusal.mjs) | S1-5 拒绝路径 | 另一租户读会话、伪造主体、跨租户取 Runtime Context、游标跨页连续、篡改的游标被拒 |

```sh
node tools/joint-a/end-to-end.mjs [--evidence <目录>] [--keep]
node tools/joint-a/refusal.mjs [--evidence <目录>] [--keep]
```

缺省证据目录是 `tmp/m2-joint-a/<脚本名>/`。`tmp/` 不入库。

## 归属

本目录归联调轨道。依据是 `docs/engineering/integration.md`「线与归属」：路径按目录前缀匹配，
表中没有列出的路径归联调轨道；`tools/` 本身列在 `engineering-toolchain` 线下，所以这里选的是
`tools/` 之下一个表里没有的目录，而不是 `tools/` 的根。写成 `tools/joint-a/` 还避开了
`pnpm-workspace.yaml` 逐个点名的工作区成员与 `apps/*` 的成员先例，不需要动锁文件。

交付线为 `integration` 的卡写入线内的路径时，route 用 `cross-track`，具名联调轨道与
受影响的线 owner（`delivery.md`「卡属性」第 3 条）。本目录落在 `engineering-toolchain`
拥有前缀之下，所以那张卡的 route 要具名该线的 owner。

## 为什么是进程级

本目录不是 pnpm 工作区成员，裸名 `@omne-harness/*` 在这里解析不到，所以脚本不导入产品包。
两份脚本都经构建产物 `dist/bin.js` 起子进程：

- `apps/harness-server/dist/bin.js s0`：装载发行层并打印插件树，装载完自动停。
- `apps/harness-server/dist/bin.js serve`：真实模式，等停止请求。
- `apps/cli/dist/bin.js`：`omne` 命令面，注册、登录、建会话、发输入。

先构建：

```sh
pnpm --filter @omne-harness/harness-server... run build
pnpm --filter @omne-harness/cli... run build
```

构建产物不在时脚本不失败，它把每一步记成等件并写出等什么。

## 判定与退出码

每一步有三态：

- **通过**：判据成立。
- **失败**：判据不成立。这是脚本要报的东西。
- **等件**：判据走不到，写明等哪一件。它不掩盖已经通的部分：替身树上能走的观察写进等件的说明。

退出码：全部通过 `0`；有失败 `1`；只剩等件 `3`。`3` 表示脚本本身没有发现问题，
只是联调的前提还没到。

## 不改实现

两份脚本只读实现：起进程、发请求、读 stdout 的 JSON 记录、只读打开 SQLite 文件。
它们不构造替身，不写产品源码，也不改发行配置。删行那一步（S0-2）用的是临时目录里的副本。
