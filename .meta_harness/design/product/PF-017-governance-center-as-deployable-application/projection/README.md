# PF-017 治理中心作为可部署应用 · 设计投影视图

本目录按版本固化本需求当前对应的完整设计投影，供实施者作为单一入口。
方法归 `harness-design-handbook` skill 的「步骤 G：投影视图落盘」。

## 版本

| 版本 | 状态 | 对应需求修订 | 发布日期 | 说明 |
|---|---|---|---|---|
| [v1](v1/projection.md) | **当前，已接受** | PF-017 rev 2（PF-016 rev 3 的据点一侧只作对端；PF-001 rev 15 的登录状态语义经账号能力 v2） | 2026-09-23 | 首版：入口契约 v1 + 账号能力 v2 + 入口层／运维面节点 + tenancy-host 的两步开闸与升级整体性 + storage-sql／clock 本程修订；[D-028](../../../record/decisions/governance-center-design-acceptance/README.md) 同日接受为实施入口 |

**当前应实施的版本：v1**，接受依据是 [D-028](../../../record/decisions/governance-center-design-acceptance/decision.md)。接受的是设计与实施入口，不表示任何实现或验证已完成；
第 7 节的未决项仍是显式缺口，其中 G-10 传输绑定与 G-11 防冒充手段**必须在入口层建包之前闭合**。

租户领域其余部分（账号、组织、注册、共用数据）的投影在 [PF-001 投影 v2](../../PF-001-identity-scope-and-agent-constraints/projection/README.md)；本投影只讲治理中心这一侧多出来的东西，两份互相指路、不互相重复。

## 使用与维护

- 实施者读当前版本的 `projection.md` 即可取得全部设计输入；需要追溯来源时按其 `provenance.json` 回到各权威正文。
- 本视图是**某一时刻的派生快照**，不是权威。与上游不一致时以上游为准。
- 需求变更或设计变更导致内容不再成立时**发布新版本，不原地改旧版**；旧版本保留并标注被谁取代。
- **来源未冻结时，每次据它实施之前先人工核一遍 `provenance.json` 里的坐标是否仍是当前文件**——工作区没有替投影核漂移的自动检查。
