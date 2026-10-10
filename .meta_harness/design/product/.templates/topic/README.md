---
id: {{PF-0NN}}
title: {{主题}}
status: {{draft | active | retired}}
revision: {{N}}
relations:
  supersedes: []
  depends-on: []
  extends: []
---

# {{PF-0NN}}：{{主题}}

<!-- documentation:placeholder -->

{{产品问题、范围和相邻责任。}}

## 当前范围与维护

{{topic owner、当前修订与接受范围。明确未决内容不具有已接受含义。产品接受不表示技术接受、实现或验证完成。}}

## 阅读入口

| 问题 | 正文 |
| --- | --- |
| 概念、规则、边界和未决 | [产品设计](design.md) |
| 用户旅程和异常 | [流程与状态](flows.md) |
| 结果和禁止事项 | [验收标准](acceptance.md) |
| 活动交付切片 | {{主Project按topic筛选的视图／Issue查询链接，不手填卡列表}} |

<!-- 按真实用途保留 flows.md 和 acceptance.md，删除未建立文件的导航。下列配置链接相对于 product/<topic>/README.md。 -->

{{活动交付查询从[交付配置](../../../../docs/engineering/github-delivery.json)读取实际仓库及主Project，再按本topic定位生成，不填写猜测URL或复制活动卡清单。未启用／未接入时写明具名接入缺口，旧卡继续按现行约定处理。启用新协议后的新交付使用Issue，不另建stories.md。产品结果引用持续acceptance场景；独立技术工作不强制附属本topic。技术承接直接链接实际拥有者；无成员时链接具名旧源及待裁入口，不编造目标包。}}

## 维护与交接

{{产出者和维护者是本topic的产品拥有者；使用者、系统与领域设计者、实施及验收者从对应正文读取。产品含义改变时沿现行修订规则同步实际消费者、词条和对象依据。只切卡或更新状态不改变产品revision。当前产品规则不是实现完成记录；覆盖、实际执行与具名交付接受分别定位。}}

## 关系

{{解释 front-matter 的关系与消费范围。supersedes 仅表示全部取代。依赖的精确修订在 design.md 的依赖表维护。不手写反向索引。}}
