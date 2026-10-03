# 评审与处置

当前设计revision2的技术机制已由D-116采用，实现与实际验证仍待。原[历史首稿评审](previous-review.txt)保存旧D-114称呼和当时范围；旧采用声明不是正式接受。

- 选择／原生装载：B1私有LosslessNumber跨src/dist身份导致整数/联合type错判；[r1](review-65-load-boundary.txt)保留反例，[r2](review-65-load-boundary-r2.txt)复评认定无损文本接收侧机制闭合。该r2只判机制，未验证正式生成路径。
- 选择／公开面与owner：r1生产Schema捕获时点存在漏洞；[r1报告](review-65-public-boundary-r1.txt)及[r2复评](review-65-public-boundary-r2.txt)保留。r2明确AE发布时复制冻结生产资源，三个owner共享快照；AM函数改传绑定owner，作者临时编译保留。
- 计划：原扩散顺序P-B1见[r1](review-65-plan-r1.txt)，已在revision2安排CB/messages/identity真实组合扩散门；[r2](review-65-plan-r2.txt)只核简报提供的修订，未读r2全文，不能代表完整正式计划接受。

当前设计补齐实际26图清单、两技术子入口API、构建事务与私有.schema读数；共享接线revision2复评结论见下文。上述独立意见不接受实现，不代表五类构建失败、实际包子入口、所有图等价或性能通过。ROOT已写入D-116与现行节点投影，继续负责完整计划与实际扩散门；最终L3实现评审/QA仍待。

## 共享机制的追加核对

[revision1报告的ROOT摘要](review-65-shared-mechanism-r1.txt)发现C-B1，原生接收器与关键字可能分别经Vitest/native装载；[revision2复评](review-65-shared-mechanism-r2.txt)在明确生成CJS自行绑定两者并只暴露文本函数后关闭设计矛盾。精确受审正文保存于[原件](reviewed-design-r2.txt)，SHA2564967df5aec5a5bf234c1a5e4e88dd7a3692a2bff0a7bbe4c7b0b6893936d614a。实际发布与扩散门仍待。

完整共享机制经revision2复评后，ROOT在既有自主交付授权下以D-116作有限技术采用；只有代表性三成员实施先行，全部运行证据和扩散释放仍待。

## 完整计划核对

[revision3全文报告](review-65-plan-r3.txt)无阻断；此前r2只核简报的未覆盖仍保留。N1建议由ROOT采纳：共享helper/codegen/构建输入改变，暂停受影响扩散、补验受影响门项，在新摘要重新释放；不是自动全量重跑。过程计划仍归任务tmp，不进record；本报告不接受设计正文的表达，也不代表运行验证。


## 2026-10-03 AE 发布快照的身份断言迁移

主体合并后的默认 owner 片触发旧端口身份断言：候选 b03945d7e 的 AE 慢层128条中127通过，首个 toBe(originalPort)失败。已接受 design.md 要求复制全部生产 Schema/ports，旧身份与该边界不相容。窄[选择评审原件](default-owners-identity-choice.txt)未发现阻断或新增产品选择；评审未运行工具，不代表实现验收。

ROOT 在原自主技术交付授权内采纳有限迁移：更换 body-domain.spec.ts 和 tools/core-verification/src/w6-asset-consumer.ts 各四处 tool/skill/mcp/slash_command 端口身份断言，以及后者一处LC3 Schema身份断言，核新 port、新 Schema 身份、Schema值与category相同，以及三个职责函数引用相同。保留五类keys、冻结、LC3值等价与其余业务预期；新增LC3不同Schema身份。原失败与后续实际结果分开记录，不再声称全部旧断言逐项不变。
