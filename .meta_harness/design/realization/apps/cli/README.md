# cli应用节点

## 工作区接入的适用范围

工作区增量继续受 design.md 的 C-3 据点读面、C-4 未来中心资产边、C-8 完整 runtime／受理、C-13 会话责任约束。旧 AM／AE 输入及 HI 的租户资产导入链不能直接用于共享实例和工作区兼容发现；待新契约后接续，不能在 CLI 胶水中补出身份、关系或启用语义。现有治理交付和验证范围不扩大。

依据：[工作区产品规则](../../../product/PF-020-workspace/design.md)；[既有装配缺口](design.md)。

**跨 PF 工作区一致性复核（2026-09-27）**：PF-016 rev 10 的显式登记、共享实例与资产重载属于工作区交付增量；既有治理 CLI/TUI 契约尚未覆盖这些接口。当前仅更新产品引用并登记消费缺口，保留原已接受契约、部署、实现与验证范围。

**工作区产品接受（2026-09-28）**：PF-020 rev 21 已由 [D-074](../../../record/decisions/session-workspace-product-acceptance/decision.md) 正式接受；本节点的治理交付范围不变。工作区身份、实例、地址与参与关系的产品接受不表示相应契约、实现或验证完成。

**2026-09-26 裁决对账**：[D-064 ⑭](../../../record/decisions/assets-runtimes-rulings-2026-09-26/decision.md) 已允许 hooks 子进程落宿主机，取代此前「产品未允许」的前提。现行未完成项是 EE G-3 的允许读面接线与 HI G-15 的工作目录、变量名单来路；缺席时仍按契约拒绝。本次只更新裁决依据，未登记实现或验证完成。


- kind：assembly
- 交付面：[PF016](../../../product/PF-016-cli-tui-delivery-surface/README.md)（rev 11），首批治理CLI/TUI。
- 源码位置：`apps/cli`，D049文件输入增量已实现。
- 语义接受：CQ1 S1～10已由[D049](../../../record/decisions/governance-cli-file-entry-adoption/README.md)接受；消费CG2/CLS1及冻结CG1报告表示。
- 可实施：D049受保护文件CLI与D051限定profile的治理TUI；两者共用CG2/CLS1，秘密仍从保护文件读取，精确边界归[governance.md](governance.md)与[tui.md](tui.md)。
- 绑定与验证：68项应用测试、两平台真实CLI子进程/PTY/管道验证通过；[verification](verification.md)及[bindings](bindings.yaml)按实际增量更新。详见[本次运行](../../../record/evidence/2026-09-25-tests-cli-file-entry/README.md)。提供者139测试独立保留，不当CLI测试。
- 分发：D050已采用[可搬运归档](packaging.md)，真实归档与纯BUILD_ID版本显示已实现；89项应用/打包测试通过，独立中心进程治理旅程已在macOS/Linux arm64/amd64通过。见[制品及独立中心运行](../../../record/evidence/2026-09-25-tests-cli-portable-host/README.md)。
- 终端范围沿 D054：已验证限定 xterm/iTerm profile 与输入法场景，仍有明确有限项；不泛化为任意终端安全。中心服务管理、每日备份工具与只隔离恢复见[维护验证](../../../record/evidence/2026-09-26-tests-governance-maintenance/README.md)。实际员工安装与整机损毁灾备仍待环境验收；没有交互密码输入。

旧完整Agent形态的三进程/据点、斜杠命令与前端层次见[architecture.md](architecture.md)，均为后续候选；本期治理不要求先建据点或Agent工作会话。PF016 rev7是当前产品范围，产品不替代CQ1与D049接受依据。

2026-09-25接续：[D051](../../../record/decisions/governance-tui-entry-adoption/README.md)接受CQ2与[tui.md](tui.md)限定提供路径，允许进入TUI实现；不覆盖上方CLI既有证据，TUI实际验证与Mac支持仍待交付。

D051实现接续：[本次主线运行](../../../record/evidence/2026-09-25-tests-tui-increment/README.md)记录TUI源码、115项CLI/TUI/打包测试、真实中心旅程/PTY、XTerm正常退出与仓库外制品。状态为已实现的验证中增量；当时独立QA及源码review被宿主令牌错误阻止；认证恢复后的新结论见下。

D051-r3当前验证：[修复、独立QA与跨系统运行](../../../record/evidence/2026-09-25-tests-tui-cross-os/README.md)封存126项源码测试、53个独立观察、两方向Mac/Linux网络治理旅程及实际UTF8 XTerm粘贴/缩放/退出。34表单为原Preview输入覆盖，不是全部业务成功；Mac GUI/IME与第二模拟器仍未完成，独立完整交付判为Unable to verify。

2026-09-25接续：[D054](../../../record/decisions/governance-iterm-provider-adoption/README.md)采用[iTerm R2](iterm.md)。ModeReplies与失败排空已实施，133项CLI测试/类型/结构规则通过；真实产品GUI输入/resize/退出恢复与超时PTY探针通过，完整制品独立验收仍待运行。原D053固定制品QA不受新dist影响；新制品与证据另封存，不覆盖旧运行。


## 2026-09-26 终审修补与最终制品

[最终固定输入、运行与独立QA](../../../record/evidence/2026-09-26-tests-governance-review-fixes/README.md)接续D055/D056与D057：生产闭包移除测试运行器，初始化未收场责任与叠加故障诊断修复，领域契约不变。18成员最终合并1926通过/34跳过，host最终单独重跑；两包清单、严格独立类型消费、47项独立制品旅程及真实首启故障恢复、三组跨OS与systemd通过。最终host r3、CLI r2的SHA/BUILD_ID在该run；旧记录不提升到新制品。Fable三轮及主线处置均有公开记录，未发现本期阻断。

限定：首次工作根创建须串行；原位源变动精确hash/fstat分支未独立验到；TUI仍限D054 profile，不是任意终端支持；恢复只隔离，同机备份不覆盖整机/磁盘毁损。公司实际部署、Agent工作会话与Web/desktop不属于本次验证。
