"""Guard the live role collection: every design and development role inlines the shared taste."""
import tomllib
from pathlib import Path

ROLES = Path(__file__).parents[2] / "agents/roles"
TASTE = "../engineering-taste.md"
# Product roles take the product-manager viewpoint and must not judge engineering choices.
EXEMPT = {"product-design-drafter", "product-design-reviewer"}


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
