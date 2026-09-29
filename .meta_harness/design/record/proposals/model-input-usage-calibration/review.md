# 评审与处置

- 待审对象：U0 revision 2，本包 README、design、alternatives、spec-construction-brief 与 baseline.json；交付 commit 由主线任务交接记录指认。
- 当前事实：作者已自检；**独立 architecture review 进行中，尚无最终评审结论**，没有接受决定。
- 评审目标：判断 C 的数据承载与 owner 边界、两类失效的完备解释、同批提交和恢复、公开函数独立性，以及是否遗漏会改变方案的保证冲突。
- 作者不兼任接受者，不把研究/旧 TLC 或本轮离线性能结果视为新语义验证。

实际评审到来后追加发现、证据、处置与复核修订；不把主线转达的初步意见当作最终评审。G1～G4 的依赖边界见 design.md；技术字段最终命名及后继版本由规格/registry owner 承接。

## Revision 2：主线转达的两项初步意见

2026-09-29，主线要求收紧施工输入：① 不为旧日志增加可选兼容路径；已将后继当前格式的校准字段及 observation 判别设为必填，缺 usage 用 unavailable，格式边界引用 RT9 S-74。② 不把兼容依据 owner 留给 spec 作者；已明确绑定的适配/计量提供者、固定版本组合及 planner 核验责任，未知回退并禁止 caller trust/skip 布尔，引用 RT9 S-53/S-57/S-60/S-74。处置由独立 reviewer 复核，作者未自行接受。
