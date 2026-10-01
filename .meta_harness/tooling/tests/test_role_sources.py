"""Guard the live role collection: every design and development role inlines the shared taste."""
import tomllib
from pathlib import Path

ROLES = Path(__file__).parents[2] / "agents/roles"
TASTE = "../engineering-taste.md"
# Product roles take the product-manager viewpoint and must not judge engineering choices.
EXEMPT = {"product-design-drafter", "product-design-reviewer"}
DEVELOPERS = {"developer", "verification-developer", "tui-developer"}
# The two technical drafters stay separate roles (contracts state properties, providers state bindings)
# and share one drafting discipline instead of each carrying its own copy.
DRAFTERS = {"spec-drafter", "realization-drafter"}
# Merged into `developer` or retired on 2026-10-01; a source package under one of these names
# would bring back module-owned implementers or an agent that drafts architecture readings.
# `tui-qa` was generalised into `qa` the same day: acceptance is not specific to terminal UIs.
RETIRED = {"kernel-developer", "capability-developer", "infrastructure-developer",
           "application-developer", "architecture-drafter", "tui-qa"}


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


def test_both_drafters_inline_the_same_drafting_discipline():
    """A drafter that loses the shared discipline loses its stop, report-back and close-out rules."""
    for name in DRAFTERS:
        prompts = shared_prompts(ROLES / name)
        assert prompts.count("../drafter-contract.md") == 1, name
        assert prompts.index(TASTE) < prompts.index("../drafter-contract.md"), name
    others = [role.name for role in ROLES.iterdir()
              if role.is_dir() and role.name not in DRAFTERS and "../drafter-contract.md" in shared_prompts(role)]
    assert not others, f"only the technical drafters inline the drafting discipline: {others}"


def test_retired_roles_do_not_come_back():
    present = sorted(name for name in RETIRED if (ROLES / name).exists())
    assert not present, f"retired role source packages are back: {present}"


def test_developer_leaves_the_codex_model_to_the_dispatcher():
    """Codex lets a role-file model override the dispatch value, so the merged role must not pin one."""
    codex = tomllib.loads((ROLES / "developer/codex.toml").read_text(encoding="utf-8"))
    assert "model" not in codex
