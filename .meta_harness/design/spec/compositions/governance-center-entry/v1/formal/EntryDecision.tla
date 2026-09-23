---------------------------- MODULE EntryDecision ----------------------------
(***************************************************************************)
(* composition.governance-center-entry v1 · 判定次序 × 四种入口答复        *)
(* × 「判不了优先于无效」的行为模型。                                      *)
(*                                                                         *)
(* 一个行为 = 一个请求从到达走到答复。请求的形状（路由类别、版本对不对得  *)
(* 上、信封合不合格、出示物是哪一种、载荷合不合格）在初始状态里任取；      *)
(* 每一次现读（认人、身份推导、补授权、领域操作）读得到与读不到由环境      *)
(* 任选；出示的登录状态在答复之前的任何时刻都可能被撤销。                  *)
(*                                                                         *)
(* 条款到定义的映射、前提与未建模部分见同目录 README.md。                  *)
(* Mutation 常量只供有效性核对（Validity_*.cfg）把某一条次序或映射改坏；   *)
(* 登记为 formal task 的配置一律取 "none"。                                *)
(***************************************************************************)
EXTENDS Naturals, TLC

CONSTANT Mutation

Mutations == {"none",
              "passthroughStateNotValid",   \* ③ 读到「出示的登录状态已不作数」时原样透传
              "unavailableAsRejected",      \* ② 读不到时答「无效」
              "readPresentationBeforeVersion", \* 核版本之前先看出示物
              "inputBeforeAuth",            \* 要认人的路由先看载荷再认人
              "gateUnavailableAsDenied",    \* 补授权读不到时答成拒绝
              "defectAsResult"}             \* 缺陷原样当结果交出

ASSUME Mutation \in Mutations

(* 路由类别：公开体检；免认人（注册、登录）；要认人；要认人且有补授权。 *)
Routes     == {"publicHealth", "exempt", "auth", "authGated"}
AuthRoutes == {"auth", "authGated"}

(* 出示物的七种情形。前三种不用查就判得了；后四种要查（现读 S-17）。 *)
PresKinds     == {"absent", "multiple", "malformed",
                  "valid", "revoked", "neverIssued", "otherCenter"}
LookupFree    == {"absent", "multiple", "malformed"}
NotIssuedHere == {"revoked", "neverIssued", "otherCenter"}

(* 四种入口答复（S-6），加上公开体检答复与路由结果（领域成功值或具名结果原样透传）。 *)
EntryAnswers == {"versionMismatch", "loginStateRejected", "unavailable", "invalidInput"}
Replies      == EntryAnswers \cup {"health", "result"}

Stages == {"start", "envelope", "payloadEarly", "auth", "payload",
           "derive", "gate", "dispatch", "done"}

VARIABLES
    route, versionOk, envelopeOk, pres, payloadOk,   \* 请求的形状，初始状态里定下
    pc, reply,
    revoked,            \* 出示的那个登录状态此刻已被撤销（环境）
    presentationRead,   \* 入口看过出示物
    passedAuth,         \* 第 ② 步认出了人
    gatePassed,         \* 补授权通过
    domainCalled,       \* 领域操作被调用
    lookupFailed,       \* 本请求里某一次现读判不了
    rejectionJudged,    \* 「无效」是一次判出来的结论（不用查即知，或查到了）
    stateNotValidSeen,  \* ③ 或身份推导读到「出示的登录状态此刻不作数」
    defectRecorded      \* 领域给出了其失败集合之外的东西

vars == <<route, versionOk, envelopeOk, pres, payloadOk, pc, reply, revoked,
          presentationRead, passedAuth, gatePassed, domainCalled, lookupFailed,
          rejectionJudged, stateNotValidSeen, defectRecorded>>

TypeOK ==
    /\ route \in Routes
    /\ versionOk \in BOOLEAN /\ envelopeOk \in BOOLEAN /\ payloadOk \in BOOLEAN
    /\ pres \in PresKinds
    /\ pc \in Stages
    /\ reply \in Replies \cup {"none"}
    /\ revoked \in BOOLEAN /\ presentationRead \in BOOLEAN /\ passedAuth \in BOOLEAN
    /\ gatePassed \in BOOLEAN /\ domainCalled \in BOOLEAN /\ lookupFailed \in BOOLEAN
    /\ rejectionJudged \in BOOLEAN /\ stateNotValidSeen \in BOOLEAN
    /\ defectRecorded \in BOOLEAN
    /\ (pc = "done") <=> (reply # "none")

Init ==
    /\ route \in Routes
    /\ versionOk \in BOOLEAN
    /\ envelopeOk \in BOOLEAN
    /\ pres \in PresKinds
    /\ payloadOk \in BOOLEAN
    /\ pc = "start"
    /\ reply = "none"
    /\ revoked = FALSE
    /\ presentationRead = FALSE
    /\ passedAuth = FALSE
    /\ gatePassed = FALSE
    /\ domainCalled = FALSE
    /\ lookupFailed = FALSE
    /\ rejectionJudged = FALSE
    /\ stateNotValidSeen = FALSE
    /\ defectRecorded = FALSE

Answer(r) == /\ reply' = r
             /\ pc' = "done"

(* S-18：公开体检不看版本、不看出示物、不读存储。 *)
PublicHealth ==
    /\ pc = "start" /\ route = "publicHealth"
    /\ Answer("health")
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed, domainCalled,
                   lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>

(* S-10 第 ① 步：版本核对先于一切；对不上只答 versionMismatch，不读出示物。 *)
CheckVersion ==
    /\ pc = "start" /\ route # "publicHealth"
    /\ presentationRead' = (Mutation = "readPresentationBeforeVersion" /\ route \in AuthRoutes)
    /\ IF ~versionOk
         THEN Answer("versionMismatch")
         ELSE /\ pc' = "envelope"
              /\ UNCHANGED reply
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked, passedAuth,
                   gatePassed, domainCalled, lookupFailed, rejectionJudged,
                   stateNotValidSeen, defectRecorded>>

(* S-10 第 ①′ 步：信封本身（路由在不在表内、有无表外成员）——不用查。 *)
CheckEnvelope ==
    /\ pc = "envelope"
    /\ IF ~envelopeOk
         THEN Answer("invalidInput")
         ELSE /\ pc' = IF route = "exempt" THEN "payload"
                       ELSE IF Mutation = "inputBeforeAuth" THEN "payloadEarly"
                       ELSE "auth"
              /\ UNCHANGED reply
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed, domainCalled,
                   lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>

(* 变异 inputBeforeAuth 才会走到这一格：先看载荷，再认人。 *)
CheckPayloadEarly ==
    /\ pc = "payloadEarly"
    /\ IF ~payloadOk
         THEN Answer("invalidInput")
         ELSE /\ pc' = "auth"
              /\ UNCHANGED reply
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed, domainCalled,
                   lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>

(* S-11 第 ② 步：认人。不用查即判得了的三种照判「无效」；要查的读不到 ⇒ unavailable。 *)
Authenticate ==
    /\ pc = "auth"
    /\ presentationRead' = TRUE
    /\ \/ /\ pres \in LookupFree
          /\ rejectionJudged' = TRUE
          /\ Answer("loginStateRejected")
          /\ UNCHANGED <<lookupFailed, passedAuth>>
       \/ /\ pres \notin LookupFree
          /\ lookupFailed' = TRUE
          /\ Answer(IF Mutation = "unavailableAsRejected"
                      THEN "loginStateRejected" ELSE "unavailable")
          /\ UNCHANGED <<rejectionJudged, passedAuth>>
       \/ /\ pres \notin LookupFree
          /\ (pres \in NotIssuedHere \/ revoked)
          /\ rejectionJudged' = TRUE
          /\ Answer("loginStateRejected")
          /\ UNCHANGED <<lookupFailed, passedAuth>>
       \/ /\ pres = "valid" /\ ~revoked
          /\ passedAuth' = TRUE
          /\ pc' = IF Mutation = "inputBeforeAuth" THEN "derive" ELSE "payload"
          /\ UNCHANGED <<reply, lookupFailed, rejectionJudged>>
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked, gatePassed,
                   domainCalled, stateNotValidSeen, defectRecorded>>

(* S-10：载荷的表示层校验。要认人的路由在认出人之后才看；免认人的版本对上就看。不用查。 *)
CheckPayload ==
    /\ pc = "payload"
    /\ IF ~payloadOk
         THEN Answer("invalidInput")
         ELSE /\ pc' = IF route = "exempt" THEN "dispatch" ELSE "derive"
              /\ UNCHANGED reply
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed, domainCalled,
                   lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>

(* S-12：身份推导（现读 OG S-36）。读到「出示的登录状态已不作数」只可能出自其间的撤销。 *)
Derive ==
    /\ pc = "derive"
    /\ \/ /\ lookupFailed' = TRUE
          /\ Answer("unavailable")
          /\ UNCHANGED <<rejectionJudged, stateNotValidSeen>>
       \/ /\ revoked
          /\ stateNotValidSeen' = TRUE
          /\ rejectionJudged' = TRUE
          /\ Answer("loginStateRejected")
          /\ UNCHANGED lookupFailed
       \/ /\ pc' = IF route = "authGated" THEN "gate" ELSE "dispatch"
          /\ UNCHANGED <<reply, lookupFailed, rejectionJudged, stateNotValidSeen>>
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed, domainCalled, defectRecorded>>

(* S-13：补授权（现读 OG S-26）。无效 ⇒ notAuthorized，作为路由结果；读不到 ⇒ unavailable。 *)
Gate ==
    /\ pc = "gate"
    /\ \/ /\ lookupFailed' = TRUE
          /\ Answer(IF Mutation = "gateUnavailableAsDenied" THEN "result" ELSE "unavailable")
          /\ UNCHANGED gatePassed
       \/ /\ Answer("result")                \* 该组织里无效 ⇒ notAuthorized 原样作为路由结果
          /\ UNCHANGED <<lookupFailed, gatePassed>>
       \/ /\ gatePassed' = TRUE
          /\ pc' = "dispatch"
          /\ UNCHANGED <<reply, lookupFailed>>
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, domainCalled, rejectionJudged,
                   stateNotValidSeen, defectRecorded>>

(* S-14：第 ③ 步，路由到领域操作并映射它的答复。 *)
Dispatch ==
    /\ pc = "dispatch"
    /\ domainCalled' = TRUE
    /\ \/ /\ Answer("result")                \* 成功值，或其余具名结果原样透传
          /\ UNCHANGED <<lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>
       \/ /\ lookupFailed' = TRUE            \* unavailable / storage-unavailable
          /\ Answer("unavailable")
          /\ UNCHANGED <<rejectionJudged, stateNotValidSeen, defectRecorded>>
       \/ /\ Answer("invalidInput")         \* 领域判出载荷的表示层不合格
          /\ UNCHANGED <<lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>
       \/ /\ route \in AuthRoutes /\ revoked \* 领域再读登录状态，读到它已不作数
          /\ stateNotValidSeen' = TRUE
          /\ rejectionJudged' = (Mutation # "passthroughStateNotValid")
          /\ Answer(IF Mutation = "passthroughStateNotValid"
                      THEN "result" ELSE "loginStateRejected")
          /\ UNCHANGED <<lookupFailed, defectRecorded>>
       \/ /\ defectRecorded' = TRUE          \* 失败集合之外的东西
          /\ Answer(IF Mutation = "defectAsResult" THEN "result" ELSE "unavailable")
          /\ UNCHANGED <<lookupFailed, rejectionJudged, stateNotValidSeen>>
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, revoked,
                   presentationRead, passedAuth, gatePassed>>

(* 环境：出示的那个有效登录状态在答复之前的任何时刻被撤销（AI S-16 的一次提交）。 *)
Revoke ==
    /\ pc # "done" /\ pres = "valid" /\ ~revoked
    /\ revoked' = TRUE
    /\ UNCHANGED <<route, versionOk, envelopeOk, pres, payloadOk, pc, reply,
                   presentationRead, passedAuth, gatePassed, domainCalled,
                   lookupFailed, rejectionJudged, stateNotValidSeen, defectRecorded>>

Pipeline == PublicHealth \/ CheckVersion \/ CheckEnvelope \/ CheckPayloadEarly
            \/ Authenticate \/ CheckPayload \/ Derive \/ Gate \/ Dispatch

Next == Pipeline \/ Revoke

Spec == Init /\ [][Next]_vars /\ WF_vars(Pipeline)

-----------------------------------------------------------------------------
(* 断言。每一条都写明它对着哪一条条款；变异配置各改坏其中至少一条。 *)

(* S-7：答复集合闭合——答了就恰是六类之一，没有第七类。 *)
AnsweredClosed == pc = "done" => reply \in Replies

(* S-8、S-10 ①：版本对不上时，除公开体检外只答 versionMismatch，且出示物没被看过、领域没被调用。 *)
VersionFirst ==
    (route # "publicHealth" /\ ~versionOk) =>
        /\ ~presentationRead
        /\ ~domainCalled
        /\ (pc = "done" => reply = "versionMismatch")

(* S-18：公开体检不受任何一关挡，不看出示物，不读存储。 *)
HealthUnconditional ==
    route = "publicHealth" =>
        /\ ~presentationRead /\ ~domainCalled /\ ~lookupFailed
        /\ (pc = "done" => reply = "health")

(* S-19：免认人的两条路由不看出示物。 *)
ExemptIgnoresPresentation == route = "exempt" => ~presentationRead

(* S-10、S-11：「判不了优先于无效」——本请求里有一次现读判不了，答复就是 unavailable。 *)
CannotJudgeIsUnavailable == (pc = "done" /\ lookupFailed) => reply = "unavailable"

(* S-6、S-11：「无效」只来自一次判出来的结论，从不来自读不到。 *)
RejectionOnlyWhenJudged == reply = "loginStateRejected" => rejectionJudged

(* S-11：版本对得上、信封合格、判得了时，没带／多个／表示层非法／撤销／从没签发／别的中心签的，
   同一个答复。 *)
RejectionUniform ==
    ( /\ pc = "done" /\ route \in AuthRoutes /\ versionOk /\ envelopeOk
      /\ ~lookupFailed
      /\ (pres \in LookupFree \/ pres \in NotIssuedHere) )
    => reply = "loginStateRejected"

(* S-33：认人之后才读到「出示的登录状态已不作数」，答复与在 ② 被拒逐字相同。 *)
LateRevocationUniform == (pc = "done" /\ stateNotValidSeen) => reply = "loginStateRejected"

(* S-10：要认人的路由，「输入不合格」只在认出人之后给出。 *)
InputAfterAuth ==
    (route \in AuthRoutes /\ envelopeOk /\ reply = "invalidInput") => passedAuth

(* S-10、S-19：免认人的路由，载荷不合格不用查就判——存储此刻读不到也照判。 *)
ExemptInputWithoutLookup ==
    (pc = "done" /\ route = "exempt" /\ versionOk /\ envelopeOk /\ ~payloadOk)
        => reply = "invalidInput"

(* S-10、S-13：领域操作只在版本、信封、载荷都过、要认人的已认出、要补授权的已通过之后被调用。 *)
NoDomainWithoutGates ==
    domainCalled =>
        /\ versionOk /\ envelopeOk /\ payloadOk
        /\ (route \in AuthRoutes => passedAuth)
        /\ (route = "authGated" => gatePassed)

(* S-14：缺陷对来者一律 unavailable，并留下缺陷记录。 *)
DefectIsUnavailable == (pc = "done" /\ defectRecorded) => reply = "unavailable"

Safety == /\ AnsweredClosed /\ VersionFirst /\ HealthUnconditional
          /\ ExemptIgnoresPresentation /\ CannotJudgeIsUnavailable
          /\ RejectionOnlyWhenJudged /\ RejectionUniform /\ LateRevocationUniform
          /\ InputAfterAuth /\ ExemptInputWithoutLookup /\ NoDomainWithoutGates
          /\ DefectIsUnavailable

(* S-10 的进展：流水线有弱公平时，每个请求终会得到答复。 *)
EventuallyAnswered == <>(pc = "done")

-----------------------------------------------------------------------------
(* 有效性核对用的「否定可达」谓词：每一条都预期被违反（证明那一类答复可达）。
   只出现在 Validity_Reachability.cfg，不登记为 formal task。 *)
NeverHealth             == reply # "health"
NeverResult             == reply # "result"
NeverVersionMismatch    == reply # "versionMismatch"
NeverRejected           == reply # "loginStateRejected"
NeverUnavailable        == reply # "unavailable"
NeverInvalidInput       == reply # "invalidInput"
NeverLateRevocation     == ~stateNotValidSeen
NeverGatePassed         == ~gatePassed
=============================================================================
