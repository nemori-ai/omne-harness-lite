// Organization structure and ancestor relations. See README.md for scope and premises.
sig Organization {}

sig PersonalOrganization, TeamOrganization in Organization {}

fact Variants {
    Organization = PersonalOrganization + TeamOrganization
    no PersonalOrganization & TeamOrganization
}

sig Config { parent : Organization -> lone Organization }

fact PersonalOrganizationOffChain {
    all c : Config {
        no PersonalOrganization.(c.parent)          
        no (c.parent).PersonalOrganization          
    }
}

fun ancestorChain[c : Config, o : Organization] : set Organization {
    o.^(c.parent)
}

pred shareAncestor[c : Config, o1, o2 : Organization] {
    some (o1.*(c.parent)) & (o2.*(c.parent))
}

fun rootsOf[c : Config, o : Organization] : set Organization {
    { r : o.*(c.parent) | no r.(c.parent) }
}

pred sameAffiliationTree[c : Config, o1, o2 : Organization] {
    some rootsOf[c, o1] & rootsOf[c, o2]
}

pred acyclic[c : Config] {
    no o : Organization | o in ancestorChain[c, o]
}

pred acceptAffiliationRequest[c, c2 : Config, child, newParent : Organization] {
    
    child in TeamOrganization
    newParent in TeamOrganization
    
    no child.(c.parent)
    
    
    
    
    
    
    
    child not in newParent.*(c.parent)
    
    c2.parent = c.parent + child -> newParent
}

assert AcceptPreservesAcyclic {
    all c, c2 : Config, child, newParent : Organization |
        (acyclic[c] and acceptAffiliationRequest[c, c2, child, newParent])
            implies acyclic[c2]
}

assert PersonalOrganizationSharesNoAncestor {
    all c : Config, disj p, o : Organization |
        p in PersonalOrganization implies not shareAncestor[c, p, o]
}

assert ShareAncestorIsSameAffiliationTree {
    all c : Config, disj o1, o2 : Organization |
        acyclic[c] implies (shareAncestor[c, o1, o2] iff sameAffiliationTree[c, o1, o2])
}

pred aNonTrivialTree {
    some c : Config {
        acyclic[c]
        some disj a, b, d : TeamOrganization |
            b in ancestorChain[c, a] and d in ancestorChain[c, b]
    }
}

run aNonTrivialTree for 4 but exactly 1 Config

check AcceptPreservesAcyclic for 5 but exactly 2 Config
check PersonalOrganizationSharesNoAncestor for 5 but exactly 1 Config
check ShareAncestorIsSameAffiliationTree for 5 but exactly 1 Config
