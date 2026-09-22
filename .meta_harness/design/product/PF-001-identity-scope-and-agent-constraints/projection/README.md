# PF-001 身份、范围与对 Agent 的约束 · 设计投影视图

本目录按版本固化本需求当前对应的完整设计投影，供实施者作为单一入口。
方法归 `harness-design-handbook` skill 的「步骤 G：投影视图落盘」。

## 版本

| 版本 | 状态 | 对应需求修订 | 发布日期 | 说明 |
|---|---|---|---|---|
| [v1](v1/projection.md) | **当前，已接受** | PF-001 rev 15（另取 PF-003 rev 4 §6.14 的邀约过期一句） | 2026-09-22 | 首版：租户领域五份契约 + 六个 provider 节点的投影；[D-023](../../../record/decisions/tenant-domain-design-acceptance/README.md) 同日接受为实施入口，五份契约来源已冻结（`provenance.json` 记冻结哈希），需求与节点来源未冻结（sha256 仍 `null`） |

**当前应实施的版本：v1**，接受依据是 [D-023](../../../record/decisions/tenant-domain-design-acceptance/decision.md)。接受的是设计与实施入口，不表示任何实现或验证已完成；18 项未决 Q-n 仍是显式缺口。

**v1 落盘后闭合的未决项**（v1 正文不改，实施者按此读它的第 7 节）：Q-15 领域名——`tenancy`，[D-024](../../../record/decisions/tenancy-domain-name/README.md)（2026-09-22）。

## 使用与维护

- 实施者读当前版本的 `projection.md` 即可取得全部设计输入；
  需要追溯来源时按其 `provenance.json` 回到各权威正文。
- 本视图是**某一时刻的派生快照**，不是权威。与上游不一致时以上游为准。
- 需求变更或设计变更导致内容不再成立时**发布新版本，不原地改旧版**——
  正在照着旧版实施的人必须仍能找到他实施的那一版。
- 旧版本保留并标注被谁取代；不删除。
- **来源未冻结时，每次据它实施之前先人工核一遍 `provenance.json` 里的坐标是否仍是当前文件**——工作区没有替投影核漂移的自动检查。
