# 交互输入扩展 · CG2候选

本页接D047既有提供者，不改其包边界、存储对象或协议客户端；原[design.md](design.md)仍是已采用v1路径。CG2 S16候选尚未接受，不能提前修改v1实现或冻结资源。

## 唯一新增参与面

公开`runPrepared(intent, prompt)`；已有use对应增加同名方法，但只接invoke/logout。prompt接Preview与AbortSignal，返回Promise<PromptResult>，不拿到Bearer/CLS对象。原runAction/run完整Input路径不变。应用负责具体TTY/文件/影响文案，组合负责把这些输入固定在本动作里；没有新持久对象、长寿准备句柄或后台线程。

Intent先纯校验深捕获；configure先通过Node URL的非网络核对（HTTPS、无userinfo/query/fragment）及X509Certificate对纯CA PEM块的核对，拒绝私钥/额外材料，再形成Preview。配置投影只给解析后的可发送端点及信任摘要（CA系统/显式及原UTF-8字节SHA256，或SPKI），不向回调交出CA原文；实际保持原捕获资料不重取。根/use登记整个实际Promise。沿CG2 S16阶段表捕获本地记录、绑定和登录，准备必要身份读数后调用一次prompt；缓存直接命中也要给原本地来源预览。configure/health在目标health前提供本地来源预览，register/login在核中心后、发凭据前提供预览，普通认证动作在必要账号读数后、目标前提供预览。UI只能使用这份不可变Preview显示本次操作，不把自己的原可变参数闭包当最终来源。

prompt返回后只填对应秘密字段，捕获完整Input并核原非秘密载荷未变；目标请求仍用原绑定/P。账号补足、准备读数、后来的失效与最终目标结果一并经过原快照一次CAS，不能为了预览保存中间结果。外部换登录使迟到保存冲突，但不能让目标跟随新P。当前expectedTenant按Intent原值发送，由中心现读比较。

每个有交互的动作拥有一个AbortController；root/use关闭先关闭准入并abort各自交互，再等待实际Promise。信号可能发生在等待health/身份、prompt内或返回后；每一条到目标的路径在发起前核已取消，迟到continue不能复活。已有网络仍等D045完整结束，取消不等于可提前关CLS。调用方的prompt不能await包含自己的close，否则是调用者自等；应用信号处理从外部发起取消/close。

回调正常取消/输入槽不合按S16形成目标未发起，保留已经发生的准备读数/本地结算；回调异常只输出input阶段稳定defect，不能含原异常或秘密。取消前OG36已经成功会产生登录活动，不能撤销或说没有远端访问。只有原请求成功读数才可能进入副本，仍执行S9已知失权规则；没有新缓存owner。

## 表示与验证

CG2 Schema的Input/Output/PublicExchange直接引用冻结CG1，最终格式仍是governance-client/1；新增Intent/Preview/PromptResult只承接交互参与面的值。提供者打包时保留这份明确依赖的v1 Schema资源，不能将被引用权威原地改成v2文件。Ajv按两个精确$id装入，漂移检查分别核字节。

新增验证至少包括：输入回调看到的预览不含秘密；预览后另一进程换登录/绑定，目标仍是原身份且迟到保存不覆盖；取消后返回continue不发目标；回调未收场时close不释放CLS；未认识账号时准备OG36不成为中间CAS；目标切换使先前准备副本失效；取消/异常保留准备网络事实；全部三种秘密槽及无秘密路径；prepare-copy不新增网络续期。原106项不能充当这些新增路径已通过。

应用CQ1必须显式采用CG2后消费此面；TUI框架/真实终端尚有独立前提。此候选没有创建apps/cli的授权捷径，完整规范、模型、独立节点/规格审查和施工安排仍须收口。

2026-09-25采用接续：本页以上评审稿由[D048](../../../../record/decisions/governance-prepared-input-adoption/README.md)明确采用；源码与新增验证尚待完成，标题中的候选保留稿件来源。
