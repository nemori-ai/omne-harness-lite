# D-011：诊断目录的共同所有权

- 当前状态：已接受；实现、装配和验证状态分别核对，不由本决定自动升级
- 来源修订：e3573ca72d18bfe7ddd002df5025551b51eede46
- 来源决定：docs/decisions/D-011-diagnostics-directory-ownership.md
- 来源 SHA-256：c8bbf62c49a360eee33c5101b5c4a04f575c6870a25ce2c26d3ca43c361f5eee
- 接受日期：2026-09-14
- 实际接受依据：主调度在用户授权范围内，依据受审技术稿、真实反例和 HUB 机制复验接受提供者修订。

## 选择与范围

1. 唯一目录 owner 创建来源；打开文件前预留 slot，输出前同步借记编码字节。新旧来源、pending 与落盘文件共用同一额度。
2. 以 fs-ext 2.1.1 在固定零字节 .diagnostics.lock 上取得真实 flock，独占目录初始化和来源管理。默认额度为 8 个来源文件加 1 个锁文件、总 64 MiB。
3. 最后锁 fd 仅在子来源、准备与扫描永久静止且核对完成后关闭。最终释放未知进入 release_unknown，旧 owner 永久不得恢复写入。
4. raw fd 的关闭结果未知时不得盲重试可能已复用的数字；后继 owner 只依实际 flock 判定所有权。

适用范围：本机 diagnostics 目录创建、共同容量、flock 排他、最终关闭与未知释放。

## 理由与保留前提

每来源扫描无法拥有共同 pending 和并发创建，真实反例出现超额字节与来源数；数字 fd 复用也使一般关闭重试不安全。

这些仍是 provider 设计输入，当前实现符合性必须由诊断提供者验证单独给出；旧日志不冒充当前验证。

## 取代与影响

精确取代 D-010 中独立来源 factory 的目录管理、八文件额度解释及关闭失败重试前提；Pino、Sonic、OTel、受限记录面、短门外输出和审计边界保留。

原决定、旧评审和旧实现证据只证明其记录的对象与时点。当前规格采用、提供者符合性、应用装配与发布仍须分别引用实际
catalog、review、formal execution、provider conformance 和 release evidence；本包不会把这些状态合并为“已交付”。
