# 注册公共承诺

本包拥有 RegistrationService、四种终结值、清除失败三分类及 RegistrationStopped。
根入口是纯定义；`./cordis` 拥有 Registration 和唯一 registration 服务键。
签名和分步编排归具体提供者。

主链的产生账号、建立个人组织、激活是三次独立提交，不能合成一笔事务。
每代捕获 accounts、organizations、organizationPurge；不得把新依赖换入旧调用。
停止后不进入下一步。已交出的步骤等待真实完成，不伪造回滚、补偿或成功。
注册停止返回 interrupted；清除链以 RegistrationStopped 拒绝，不新增正常失败值。

纯实例的 close 关闭自身资格并排空在途操作，独立调用与绑定使用同一关闭过程。
显式 isActive 与实例存活位共同决定资格；管理绑定同时检查装配代际和原 fiber 资格。
不能等入口排空结束、轮到 close 时才禁止续步。借入依赖在真实完成后才能释放。
本次不增加后台清扫调度器。

验证继续覆盖原步骤/重试/清除映射、各步停止及迟到结果、真实三次提交和崩溃恢复模型。
本页拥有已采用的注册业务及集成承诺，持续资源从本成员verification读取。

## 主链与过期占用

只有第三步激活已确认才 registered，不要求回执唯一或只送一次；成功不可撤回，unknown 不是成功。produce→createPersonal→activate 始终携同一 AccountId，只有确认个人组织创建（含幂等）才产或消费本次激活依据。不自动回滚既有动作，不设整链共享事务。无账号、未激活且无 personal、未激活且有 personal，以及 active 且有 personal 都是合法持久中间／终态，丢回执不证明无效果。

produce 的 identifier-taken／credential-rejected 终结同名。未过期且材料匹配从②续，不重政策；未过期不匹配及已 active 同为 identifier-taken。已到期占用在本次调用跑清除；两步都确认后只重跑 produce 一次，得到 fresh AccountId，再续主链。第二次又到期／中断就停，不循环、不增 retry 参数、不等背景扫描；清除任何一步失败都不重跑。新账号不继承旧材料或资产，旧到期身份不复活。

createPersonal／activate expired 为 interrupted。后续 Account 不存在、warrant 无效、②③ invalidInput 为 composition-defect；① invalidInput 为 entry-defect。不可用为普通 interruption。发起者仍收到 interrupted，defect 须单独可观察，不混普通中断计数。异常或结果集合外值按提供者原抛出规则，不增第五种正常终结。

## 清除链和并发

purge 先治理清组织／成员并取得 AccountId 绑定依据，再身份清账号／释放标识。只有前一步确认成功（含幂等）才续；未知不产依据、不交下一步。清除结果保持各参与者原失败和 terminal／defect／transient 三分类，不合并两域的同名值，也不借注册四终结表示清除结果。

治理 accountIsActivated／accountNotExpired 对扫描为正常 terminal；主链刚证明 expired 后出现则 defect。治理成功清 org 后，AI not-expired 对两种发起者都不可达，属于 defect。错 kind、OG invalidInput、孤儿 accountDoesNotExist、AI 无效清除依据／invalidInput 都是 defect，诊断并移除此轮 candidate，不无限重试。unavailability 为 transient，下轮从当前事实幂等续；扫描不复用旧依据跳直 AI，不新增扫描 provider。

并发主链／清除以三次提交内现读单调状态阻隔：purge org 必须未 active 且 expired；createPersonal（含已有）必须 Account 存在且未 expired；activate 核相同状态及绑定依据。依据只证次序，不证现在仍可激活或清除。org／Account 都无时 purge org 幂等成功并重产依据；Account 无而 org 在是缺陷，不补删。两步间崩溃，下轮从治理重新取依据，不复用旧尝试、不重建组织作补偿。

换代停止资格后不发下一步，已发独立步骤仍可能迟到提交，原依赖 Promise／事务须完整观察和排空。取消不证明没交依据或没 commit。只有确认提交或明示幂等才续；提交前失败／确认回滚与提交后丢回执分开。注册未知为 interrupted，清除沿 transient 收场，不增外部错误码或非幂等补偿。

终结／清理进展以公平调用、依赖与存储最终可用、时间推进及用户未放弃为前提，钟过去不自创任务，不给真实秒数上界。progress 模型未覆盖 produce 碰到已过期占用那支的即时一次重试；该义务需规范场景，不能以 TLC 偷换为已证明。模型见 [models](verification/models/README.md)，真实三个提交及未知回执验证见 [verification](verification/README.md)。
