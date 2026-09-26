
// W1 pure-module correspondence fixture: use the adopted definitions unchanged.
one sig Root, Branch, Leaf, Other, PersonalOne, PersonalTwo extends Organization {}
one sig FixtureResult {
    ancestors : Organization -> Organization,
    shared : Organization -> Organization
}
pred coreCorrespondenceFixture {
    TeamOrganization = Root + Branch + Leaf + Other
    PersonalOrganization = PersonalOne + PersonalTwo
    Config.parent = Branch -> Root + Leaf -> Branch
    FixtureResult.ancestors = { o, a : Organization | a in ancestorChain[Config, o] }
    FixtureResult.shared = { a, b : Organization | shareAncestor[Config, a, b] }
}
run coreCorrespondenceFixture for 6 but exactly 6 Organization, exactly 1 Config, exactly 1 FixtureResult
