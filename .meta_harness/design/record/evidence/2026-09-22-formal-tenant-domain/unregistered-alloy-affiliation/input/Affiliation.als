/*
 * Affiliation.als —— 组织隶属关系的结构约束。
 *
 * 对应契约条款：
 *   S-6   个人组织不参与隶属关系（上级恒空、不作他人上级）
 *   S-7   上级组织属性：至多一个上级、上级链不成环
 *   S-12  上级链与「有共同上级」谓词
 *   S-32  接受隶属请求的三条前置（个人组织、己方无上级、判环）
 *
 * 本模型**不**表达：邀约的过期（归 data.offer-expiry v1）、授权前置
 * （谁是超管——那是成员关系的事，归 Membership.tla）、并发（结构模型表达不了交错）。
 *
 * 用法：Alloy Analyzer 逐条 check / run 本文件末尾的命令。
 * 本文件只定义模型与命令，**不在此记录执行结果**——结果归 ../../verification.md。
 */

// ---------------------------------------------------------------------------
// 组织与它的两个变体（S-5、S-6）
// ---------------------------------------------------------------------------

sig Organization {}

sig PersonalOrganization, TeamOrganization in Organization {}

// OrganizationKind 恰把组织分成两类，创建时定、无写路径（S-5）。
fact Variants {
    Organization = PersonalOrganization + TeamOrganization
    no PersonalOrganization & TeamOrganization
}

// ---------------------------------------------------------------------------
// 一份「上级组织属性此刻的取值」。
//
// 用一个 sig 把这张图物化，是为了能表达「接受一份隶属请求之前 / 之后」
// 两个状态，从而把 S-32 的判环写成一条**会失败的断言**，而不是一条事实。
//
// `parent : Organization -> lone Organization` 里的 `lone` 就是 S-7 的
// 「至多一个上级」——它由数据形状兑现，不是一次运行期检查，
// 因此本文件**不为它单写断言**：那样的断言按定义恒真，是空的。
// ---------------------------------------------------------------------------

sig Config { parent : Organization -> lone Organization }

// S-6：个人组织的上级恒空，且不作他人的上级。对每一份取值都成立。
fact PersonalOrganizationOffChain {
    all c : Config {
        no PersonalOrganization.(c.parent)          // 没有上级
        no (c.parent).PersonalOrganization          // 也不是任何人的上级
    }
}

// ---------------------------------------------------------------------------
// 派生读面（S-12）
// ---------------------------------------------------------------------------

// 上级链：顺着上级一路往上得到的组织，**不含自己**（S-12 的 ancestorChain）。
fun ancestorChain[c : Config, o : Organization] : set Organization {
    o.^(c.parent)
}

// 有共同上级：把各自算进自己的上级链之后，两条链有交集。
// 这是 PF-001 §4（rev 12）的判据：`*` 是自反传递闭包，它就是「把自己算进来」。
pred shareAncestor[c : Config, o1, o2 : Organization] {
    some (o1.*(c.parent)) & (o2.*(c.parent))
}

// 同一棵隶属树：**根相同**。这是 PF-003 §5.2 把流转边界画成「同一棵隶属树」时说的那件事。
//
// 这里**故意不写成和 shareAncestor 一样的式子**：写成一样的，A3 就退化成
// 「X iff X」，检查不出任何东西。按「根」独立写一遍，A3 才真的在核对
// 契约 S-12 那句推论——「至多一个上级 + 无环 ⇒ 顺着上级走必定终于唯一的根」。
fun rootsOf[c : Config, o : Organization] : set Organization {
    { r : o.*(c.parent) | no r.(c.parent) }
}

pred sameAffiliationTree[c : Config, o1, o2 : Organization] {
    some rootsOf[c, o1] & rootsOf[c, o2]
}

pred acyclic[c : Config] {
    no o : Organization | o in ancestorChain[c, o]
}

// ---------------------------------------------------------------------------
// S-32 接受隶属请求：从一份取值走到另一份
// ---------------------------------------------------------------------------

pred acceptAffiliationRequest[c, c2 : Config, child, newParent : Organization] {
    // 前置：个人组织不参与
    child in TeamOrganization
    newParent in TeamOrganization
    // 前置：下级尚无上级
    no child.(c.parent)
    // 前置：判环——child 不得在 newParent **含自身**的上级链上。
    //
    // `*` 而不是 `^`：`^` 是不含自身的上级链，child = newParent 时
    // `child not in ancestorChain[c, newParent]` **恒真**，三条前置全过、
    // 写进去的是一条 o -> o 的自环。这不是推演出来的担忧——
    // 本机执行 `check AcceptPreservesAcyclic` 时给出的反例正是
    // child = newParent、c2.parent = {(o, o)}。契约 S-32 ④③ 与本行同改。
    child not in newParent.*(c.parent)
    // 写入：与上面三条前置在同一次提交内（这里是同一个谓词）
    c2.parent = c.parent + child -> newParent
}

// ---------------------------------------------------------------------------
// 待核对的断言
// ---------------------------------------------------------------------------

/* A1（S-32 + S-7）：只要接受操作按上面三条前置执行，无环就被保持。
   预期：在给定规模内找不到反例。
   这条**不平凡**，而且要分两步核对：
     - 把 `child not in newParent.*(c.parent)` 整行注释掉，同一条 check 必须给出反例；
     - 把它改回不含自身的 `child not in ancestorChain[c, newParent]`，
       同一条 check **也必须给出反例**（child = newParent 的自环）。
   第二步单独有意义：它区分「判环起了作用」与「判环写漏了自环这一档」。 */
assert AcceptPreservesAcyclic {
    all c, c2 : Config, child, newParent : Organization |
        (acyclic[c] and acceptAffiliationRequest[c, c2, child, newParent])
            implies acyclic[c2]
}

/* A2（S-6 + S-12）：个人组织与任何**与它不同**的组织都没有共同上级。
   PF-001 说这是「恒为空」的直接结果，不是一条额外规定——
   这条断言就是核对那句推论。预期：找不到反例。

   `disj` 不能省：判据含自身之后，shareAncestor[c, p, p] 对任何组织都为真
   （一个组织当然与它自己同树），个人组织也不例外。这不是门被放宽了——
   消费者拿这个谓词判的是两个**不同**组织之间能不能流转。契约 S-12 同改。 */
assert PersonalOrganizationSharesNoAncestor {
    all c : Config, disj p, o : Organization |
        p in PersonalOrganization implies not shareAncestor[c, p, o]
}

/* A3（S-12）：「有共同上级」与「同一棵隶属树」是同一个判据。
   **预期：找不到反例。**

   改动前这条**预期找到反例**，反例形态是一个团队组织与它自己的上级：
   二者显然在同一棵树上，但按「两条**不含自己**的上级链求交」的旧读法为假。
   那个反例正是契约旧缺口 G-5 的具体实例。

   PF-001 rev 12 已裁定取**把各自算进自己的上级链**的那一种读法，
   并明写它与 PF-003 §5.2 的「同一棵隶属树」是同一句话。shareAncestor 随之改写，
   两个谓词此后逐字同形，本断言因此改为预期无反例。
   **保留这段注释是为了让旧读法为什么被否掉仍然可查**：
   把 shareAncestor 改回 `some ancestorChain[c,o1] & ancestorChain[c,o2]`，
   这条 check 必须重新给出那个祖先—后代反例——给不出说明规模太小。

   **本断言不平凡**：sameAffiliationTree 是按「根相同」独立写的，
   与 shareAncestor 的「含自身的链求交」不是同一个式子。两者等价要靠
   `acyclic[c]`——有环时那条链上没有根，rootsOf 为空。前件因此不能省。 */
assert ShareAncestorIsSameAffiliationTree {
    all c : Config, disj o1, o2 : Organization |
        acyclic[c] implies (shareAncestor[c, o1, o2] iff sameAffiliationTree[c, o1, o2])
}

// ---------------------------------------------------------------------------
// 一致性核对：模型能产生预期的合法实例，
// 而不是靠约束互相矛盾让上面的断言空泛成立。
// ---------------------------------------------------------------------------

pred aNonTrivialTree {
    some c : Config |
        some disj a, b, d : TeamOrganization |
            b in ancestorChain[c, a] and d in ancestorChain[c, b]
}

run aNonTrivialTree for 4 but exactly 1 Config

check AcceptPreservesAcyclic for 5 but exactly 2 Config
check PersonalOrganizationSharesNoAncestor for 5 but exactly 1 Config
check ShareAncestorIsSameAffiliationTree for 5 but exactly 1 Config
