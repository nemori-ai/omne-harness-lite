---
kind: research
source_baseline: omne-harness-lite-legacy-spec
source_commit: e3573ca72d18bfe7ddd002df5025551b51eede46
source_file: docs/research/computer-browser-shell-environment-sources.md
source_sha256: 41e454d41e22fbd470cf17aa534fcbe43c65aeda4e0a4a662969d0993414d61e
source_anchor: "heading:# Computer、Browser、Shell 与执行环境的来源核对"
target_baseline: omne-harness-lite-design-2026-09-15
migration_status: current-evidence-selection
---


# Computer、Browser、Shell 与执行环境的来源核对

[PF-012 正文](../../requirements/product/PF-012-computer-browser-shell-sandbox-and-native-use/requirements.md) · [研究索引](../README.md)

2026-09-12 用户明确确认三类 Agent 能力及各自的沙盒、本机直接使用支持。本轮
核对 `omne-next` 提交 `6263fed545e48ad9efb5714f3fe76a7c1a0af1b5`，下列文件
均与该提交 Git blob 逐字节核对。直接使用范围来自本轮用户，不依赖把原系统
某个 host-shell 实现声称成三类能力已经交付。

同日用户补充 PF-012.C2：单个部署的有效环境范围，由模型能力等级、部署装配
配置、部署默认权限和用户授权共同作用。这是本轮直接确认，不是从源模态声明
推导出的全部产品规则；整体六种组合不要求每个部署都同时开放，具体优先关系
仍待设计。

## 来源与对应范围

| 来源 | 源状态与核对章节 | PF-012 对应 |
|---|---|---|
| [隔离的 Computer 与 Browser 自动化][visual-browser] | Accepted · committed-future，2026-08-05；Outcome、pixel/DOM semantics、shared governance、相关 AC | C1/C5/C6：两类交互、独立权限、目标与接管、画面/页面状态、凭据和交接；其中不接触 host 的限制只适用隔离路径 |
| [沙盒文件与命令交互][sandbox-actions] | Accepted · current，2026-08-05；Outcome、File 与 Command/Code/Terminal semantics、相关 AC | C1/C3/C6：受控命令、终端、工作根和权限、长工作及未知结果；“永不是 host shell”是此沙盒动作族的边界 |
| [Session 沙盒取得、使用和释放][sandbox-lifecycle] | Accepted · current，2026-07-31；Statement、permission、lifecycle、AC-1～3 | C3/C4：兼容且获准的环境、不降级到未隔离、可靠回收、临时状态不等于耐久状态 |
| [设备能力使用授权][device-consent] | Accepted · current，2026-07-30，含后续范围确认；Statement、effective-state、AC-1～6 | C3：设备目标、权限模式与有效范围、执行时当前授权；本机不是隐含全权，持续授权也不必降回逐次确认 |
| [安装本机作为同意主体][own-machine] | Accepted · committed-future，2026-08-31；Statement、AC-1～5 | 本机授权旅程参考：系统能让 owner 对安装所在机器授权，不要求先配对“另一台机器”；取得主体身份不等于授予能力权限 |
| [设备授权与调用历史][device-history] | Accepted · current，2026-08-03；Outcome、AC-1～8 | 观察与授权依据的参考：实际 Agent、会话、当时权限和结果可关联，不以当前授权反推历史，不复制原始敏感环境日志 |
| [模型能力与工具装配][model-tools] | Accepted · committed-future，2026-09-04；用户原话、Statement 的原生模态声明与适配 | C1/C7：三类 use 是连续工具操作的专项能力；视觉等要求须与模型匹配。仅映射适用条件，不在本轮登记完整模型分级装配系统 |

工具状态、内部帧、单次中断、后台与重建后关联的来源已由
[PF-003](../../requirements/product/PF-003-tool-execution-observation-and-control/requirements.md)
及工具来源核对（迁移坐标：`.meta_harness/design/research/tool-execution-sources/research.md`）拥有，本轮直接引用，不重复确立另一套
工具生命周期。PF-012 的环境位置与来源中 attached/detached 执行位置是不同轴。

## 旧范围与本轮要求的关系

- **沙盒排除宿主，不等于全系统排除本机。** 沙盒交互的 EXEC-AC-1 和视觉
  来源的 PIXEL-AC-1 明确拒绝操作宿主或其它隔离范围。本轮用户明确要求另有
  运行时当前操作系统的直接使用路径；保留沙盒边界，同时登记此新路径。不能
  用旧来源的窄范围拒绝直接使用，也不能用直接使用需求解除沙盒隔离。
- **独立浏览器与本机浏览器。** 来源隔离 browser profile 不继承宿主 cookie、
  登录、存储等；这仍用于沙盒路径。本轮允许直接操作用户共享环境，具体使用
  哪个真实 profile、什么登录/凭据权限须明确，不能一律强制为全新隔离副本，
  也不能把本机支持解释为默认导入全部私人状态。
- **三类能力与环境分别表达。** Computer 的视觉交互、Browser 的页面交互、
  Shell 的命令/终端语义保留；provider 恰好同时实现多项，不产生互相授予的
  权限。六种产品组合不指定六套代码或一种统一 runtime。
- **物理位置不能证明产品边界。** 容器、浏览器引擎或 shell 恰好在本机运行，
  不能证明操作的是用户实际环境；反过来，沙盒也可物理部署在本机。安装本机
  来源只补同意主体与授权可达性，没有证明本机 GUI、浏览器及 shell 全部可用。
- **仍受本项目要求约束。** 用户直接确认优先于历史来源；租户隔离、有效授权、
  用户控制和真实结果继续成立。源 ROOT 禁令、BC/框架类型、资源句柄及具体
  provider 不被本轮提升为全部本机使用场景的实现契约；管理员权限等具体支持
  范围留待授权与环境规格决定。

## 证据范围

已读取所列相关产品章节与接受说明，未运行原系统的沙盒、GUI、浏览器或 shell。
旧 `HostShellTool` 和外围 computer/browser 项目只在来源中作为实现/迁移线索
出现，本轮未将其代码、测试或部署姿态当作要求兑现证据。没有据用户提到的
既有编码助手推断它们当前的安全策略、API 或实现细节。

本项目需要后续定义并验证隔离、共享环境控制、权限与恢复的精确契约。当前文档
检查只能确认身份、维度和引用等维护约束，不证明六种组合已实现。

[visual-browser]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/isolated-visual-computer-and-browser-automation.md
[sandbox-actions]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/governed-sandbox-interaction.md
[sandbox-lifecycle]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-authorized-session-sandbox-acquire-use-release.md
[device-consent]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-consented-device-capability-use.md
[own-machine]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/installation-own-machine-as-declared-consent-subject.md
[device-history]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-owner-scoped-device-authorization-and-capability-use-history-read.md
[model-tools]: https://github.com/nemori-ai/omne-next/blob/6263fed545e48ad9efb5714f3fe76a7c1a0af1b5/omne_harness/requirements/capabilities/resource-model-capability-tier-aware-tool-provisioning.md
