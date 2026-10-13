"""Guard the live role collection: every design and development role inlines the shared taste."""
import tomllib
from pathlib import Path

ROLES = Path(__file__).parents[2] / "agents/roles"
TASTE = "../engineering-taste.md"
# Product roles take the product-manager viewpoint and must not judge engineering choices.
EXEMPT = {"product-design-drafter", "product-design-reviewer"}
DEVELOPERS = {"developer"}
# Merged into `developer` or retired. A source package under one of these names
# would bring back a separate implementer, a terminal-only forensics name, or an agent
# that drafts architecture readings. `tui-qa` was generalised into `qa`.
# The three design reviewers became `design-reviewer`.
RETIRED = {"kernel-developer", "capability-developer", "infrastructure-developer",
           "application-developer", "architecture-drafter", "tui-qa",
           "architecture-reviewer", "spec-reviewer", "plan-reviewer",
           "spec-drafter", "realization-drafter",
           "tui-developer", "verification-developer", "tui-debugger"}


def shared_prompts(role: Path) -> list[str]:
    assembly = role / "assembly.toml"
    if not assembly.is_file():
        return []
    return tomllib.loads(assembly.read_text(encoding="utf-8")).get("shared_prompts", [])


def test_taste_is_first_shared_prompt_of_every_non_exempt_role():
    roles = sorted(p for p in ROLES.iterdir() if p.is_dir())
    assert EXEMPT <= {role.name for role in roles}, "exempt roles must exist"
    missing = [role.name for role in roles
               if role.name not in EXEMPT and shared_prompts(role)[:1] != [TASTE]]
    assert not missing, f"roles without the shared taste as first shared prompt: {missing}"
    leaked = [role.name for role in roles if role.name in EXEMPT and TASTE in shared_prompts(role)]
    assert not leaked, f"exempt roles must not inline the shared taste: {leaked}"


def test_all_developer_roles_inline_the_same_implementation_contract():
    """A role without the shared input/stop contract must fail before dispatch."""
    for name in DEVELOPERS:
        prompts = shared_prompts(ROLES / name)
        assert prompts.count("../developer-contract.md") == 1, name
        assert prompts.index(TASTE) < prompts.index("../developer-contract.md"), name


def test_retired_roles_do_not_come_back():
    present = sorted(name for name in RETIRED if (ROLES / name).exists())
    assert not present, f"retired role source packages are back: {present}"
    assert not (ROLES / "drafter-contract.md").exists()
    leaked = [role.name for role in ROLES.iterdir() if role.is_dir()
              and "../drafter-contract.md" in shared_prompts(role)]
    assert not leaked, f"retired drafting contract is referenced: {leaked}"


def test_developer_and_qa_leave_the_codex_model_to_the_dispatcher():
    """Codex lets a role-file model override the dispatch value, so these roles must not pin one."""
    for name in ("developer", "qa"):
        codex = tomllib.loads((ROLES / name / "codex.toml").read_text(encoding="utf-8"))
        assert "model" not in codex, name


def test_diagnostician_keeps_the_codex_model_pin():
    codex = tomllib.loads((ROLES / "diagnostician/codex.toml").read_text(encoding="utf-8"))
    assert codex["model"] == "gpt-6.1-sol"
