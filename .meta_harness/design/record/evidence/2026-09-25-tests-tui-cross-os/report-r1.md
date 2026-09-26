# D051-r1 治理 TUI 独立验收

**判决：Fail。** 验证者 `tui-qa`，run id `d051-r1-qa-20260925-1315z`，基线提交 `cc01c8322e71d48d784bcb66e27cb81814fd4b6f`（工作树有未提交增量）。macOS 上以合成 xterm 协议的 PTY 运行真实中心旅程并通过；这不是 Linux XTerm379 模拟器实测。固定制品在分块粘贴与业务前信号取消上违反 CQ2。此判决不是交付接受。

坐标：固定归档 SHA-256 `04f2c123ff1de3b65cb8bff4d6ec476ea5054c7b8ef8c82dd73088dab37da8e7`，BUILD_ID `c4d55a5635b39ac5f22bf8409ebd8bbb40b3242bee226e8f1861c69fcb033d8e`，搬离仓库入口 `/private/tmp/omne-cli-d051-pj4fgj0y/app/dist/main.js` SHA-256 `02160ca46203482d2bfc1a8333624d1699cd43999c270339d9d0420415183840`。真实中心由仓库 `apps/tenancy-host/dist/cli.js` SHA-256 `0c38fcc59fae65fea0fb7b3e3ef59ac919a40bece9ecf1fb90f45739174565e6` 启动，Node v24.21.0，macOS 本机 PTY，120×100 与 60×16，`TERM=xterm`、`LC_ALL=en_US.UTF-8`。合成的 DECRQM 答复只代替终端协议对端；中心/TLS/CLS/CG 均是真实进程和本地文件。报告聚合退出码 1。此处归档哈希经 `shasum` 勘误，原始运行证据未改。

| 条目 | 标准触发→结果 | 场景及证据 | 结果 |
|---|---|---|---|
| Q01 | CQ2 S2/S11：帮助纯输出，非法调用/非TTY稳定拒绝且不建状态 | `acceptance/smoke.py`，`evidence/d051-r1-smoke/` | 5/5 Pass |
| Q02 | CQ2 S3/S9：setup 一次根级动作后退出 | `acceptance/journey.py`，`evidence/d051-r1-journey-corrected2/setup-health.*`、`center.json` | 1/1 Pass，health 成功且 exit0 |
| Q03 | CQ2 S4/S8：现读 S36/S57/S60，完整身份可见 | 同一真实中心旅程，`governance-create.screens.txt`、`machine.json` | 1/1 Pass，Alice 完整 ID/来源可见 |
| Q04 | CQ2 S6/S8：写预览全部交付前不能确认，之后恰一次 | 同一旅程，60×16 三页预览、屏幕记录、机读租户列表、中心结构化请求 | 1/1 Pass，早确认拒绝，S21 请求恰一笔，租户数 1→2 |
| Q05 | CQ2 S3/S9：外部改 CLS 后旧 Use 不暗换身份 | 同一旅程，Alice TUI 与 Bob CLI 的账号 ID 不同、旧 Use exit4 | 1/1 Pass |
| Q06 | CQ2 S7/S10/S11：正常/信号/未完粘贴收场 | `acceptance/lifecycle.py`，`evidence/d051-r1-lifecycle-final/` | **1/4 Pass**；正常退出通过，信号两例 exit0，分块粘贴提前退出 |
| Q07 | CQ2 S8/S10：真实输出背压下不放行旧确认、等待写回调 | 无独立可控背压设施 | 未覆盖 |
| Q08 | CQ2 S7/S8：CJK、emoji、组合字及 resize 内容/宽度 | 旅程只验证 ASCII 与 60×16 预览；真实输入法未接 | 未覆盖 |
| Q09 | CQ1/CQ2 机读纯净及 CLI 事实一致 | `machine.json` 每次恰一 JSON 记录；真实中心操作结果与 TUI 页面对应 | 部分通过；全 34 表单差分未覆盖 |
| Q10 | D051 真实终端矩阵：两模拟器、两尺寸、Mac GUI/IME、强杀、scrollback | 本轮只有 scripted PTY；不拿它冒充 XTerm | 未覆盖 |

缺陷：

- **QA-01，较高**：在 setup 菜单收到单个 `ESC`，120ms 后才收到同一普通粘贴的剩余 `[` `200~` 时，旧制品在真实 paste 尾到达前退出 0。复现 `lifecycle.py split-paste`；`split-paste.raw/.json` 记录 `prematureExitBeforeTail=true`、`tailSent=false`。建议交 `tui-debugger` 确认分帧因果，`tui-developer` 修输入所有权。
- **QA-02，中**：尚无 CG Report 时 setup 菜单收到 SIGTERM 返回 0；未完粘贴收到 SIGTERM、待真尾结束后也返回 0。CQ2 S11 要求业务前捕获取消为 `input-cancelled/2`。复现 `lifecycle.py signal` 与 `paste-signal`，两项 2004/termios 实际恢复。建议交 `tui-developer` 修退出状态，复验保持相同断言。

未覆盖范围不能外推为通过：实际 XTerm379/Mac 终端、IME、另一个终端程序、强杀后的模拟器状态、真实背压、完整 34 表单与秘密槽、宽字符、同步输出/scrollback。强杀不承诺进程自己恢复，仍需观察外层终端受影响面。前期脚本调试出现长 Unix socket 路径、拆帧读取、可选字段选择、过早假定本地 CAS 成功等验收设施错误；`corrected2` 与 `lifecycle-final` 是本报告引用的有效运行，旧尝试证据原样保留，未作为产品不稳定性计数，也未更改判据。

清理：每轮中心经 SIGTERM 退出；全部 PTY 子进程已结束，临时账号/凭据/TLS 在临时目录撤除。仅在 `tmp/production-cli-onboarding/tui-qa/` 写了场景、原始/结构/语义证据与报告。验收脚本在本轮有效运行后的 SHA-256：`journey.py` `830746ff659f6ffe2c9ac8ac8b43c04c40c5d4a22e47374d5efd3c2b3aba0e52`，`lifecycle.py` `9e38dfcc543524694a1bb293422eab030ce279286c9cb4035183fa4d9596edea`，`smoke.py` `1522cc478c3603a3895e646158fc608b88f9c9802d6e59dfb2e81c14531737ab`。
