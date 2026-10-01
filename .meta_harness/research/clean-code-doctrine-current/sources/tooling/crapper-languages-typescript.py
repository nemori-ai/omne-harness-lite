"""TypeScript and TSX functions, methods, and cyclomatic complexity.

Decision points follow the same structural rule as crap4java: `if`, loops,
`catch`, `?:`, each `switch` case (including `default`), and `&&` / `||`.
Top-level functions and class methods are entries. Callbacks stay inside the
enclosing function. A class method's namespace is `module.Class`, which is
the uml-viewer class key.
"""

from crapper.languages.treesitter import (
    binary_logic,
    child_of_type,
    complexity,
    descendants,
    end_line,
    node_text,
    parse,
    start_line,
)
from crapper.languages.language import Language, LanguageFactory
from crapper.model import Function

_DECISIONS = {
    "if_statement",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "catch_clause",
    "ternary_expression",
    "switch_case",
    "switch_default",
}
_SKIP = {
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
}
_FUNCTION_TYPES = {
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
}


def _is_decision(node) -> bool:
    return node.type in _DECISIONS or binary_logic(node)


def _skip(node) -> bool:
    return node.type in _SKIP


def _grammar(path: str) -> str:
    if path.endswith(".tsx"):
        return "tsx"
    return "typescript"


def _module_namespace(path: str, source_root: str | None) -> str:
    relative = path.replace("\\", "/")
    root = (source_root or "").replace("\\", "/").rstrip("/")
    if root and root != "." and relative.startswith(root + "/"):
        relative = relative[len(root) + 1 :]
    elif relative.startswith("./"):
        relative = relative[2:]
    if relative.startswith("src/"):
        relative = relative[4:]
    elif "/src/" in relative:
        relative = relative.split("/src/", 1)[1]
    for suffix in (".tsx", ".mts", ".cts", ".ts"):
        if relative.endswith(suffix):
            relative = relative[: -len(suffix)]
            break
    return relative.replace("/", ".")


def _inside_function(node) -> bool:
    current = node.parent
    while current is not None:
        if current.type in _FUNCTION_TYPES:
            return True
        current = current.parent
    return False


def _class_names(data: bytes, node) -> list[str]:
    names: list[str] = []
    current = node.parent
    while current is not None:
        if current.type in {"class_declaration", "abstract_class_declaration"}:
            ident = child_of_type(current, "type_identifier", "identifier")
            if ident is not None:
                names.append(node_text(data, ident))
        current = current.parent
    names.reverse()
    return names


def _has_body(node) -> bool:
    return child_of_type(node, "statement_block") is not None


def _append(found: list[Function], **kwargs) -> None:
    found.append(Function(**kwargs))


def _append_function(found, data, node, module, path) -> None:
    if _inside_function(node) or not _has_body(node):
        return
    ident = child_of_type(node, "identifier")
    if ident is None:
        return
    _append(
        found,
        name=node_text(data, ident),
        namespace=module,
        complexity=complexity(node, _is_decision, _skip),
        start_line=start_line(node),
        end_line=end_line(node),
        path=path,
        language="typescript",
    )


def _append_method(found, data, node, module, path) -> None:
    if not _has_body(node):
        return
    ident = child_of_type(node, "property_identifier", "identifier")
    classes = _class_names(data, node)
    if ident is None or not classes:
        return
    _append(
        found,
        name=node_text(data, ident),
        namespace=f"{module}.{'.'.join(classes)}",
        complexity=complexity(node, _is_decision, _skip),
        start_line=start_line(node),
        end_line=end_line(node),
        path=path,
        language="typescript",
    )


def _append_arrows(found, data, node, module, path) -> None:
    if _inside_function(node):
        return
    for declarator in node.children:
        if declarator.type != "variable_declarator":
            continue
        ident = child_of_type(declarator, "identifier")
        value = child_of_type(declarator, "arrow_function", "function_expression")
        if ident is None or value is None:
            continue
        _append(
            found,
            name=node_text(data, ident),
            namespace=module,
            complexity=complexity(value, _is_decision, _skip),
            start_line=start_line(declarator),
            end_line=end_line(declarator),
            path=path,
            language="typescript",
        )


def functions_in_source(
    source: str, path: str, source_root: str | None = None
) -> list[Function]:
    data, tree = parse(source, _grammar(path))
    module = _module_namespace(path, source_root)
    found: list[Function] = []
    for node in descendants(tree.root_node):
        if node.type == "function_declaration":
            _append_function(found, data, node, module, path)
        elif node.type == "method_definition":
            _append_method(found, data, node, module, path)
        elif node.type == "lexical_declaration":
            _append_arrows(found, data, node, module, path)
    return found


class TypeScript(Language):
    def functions(self, source: str, path: str, project_root: str) -> list[Function]:
        return functions_in_source(source, path, project_root)


class TypeScriptFactory(LanguageFactory):
    def create(self) -> Language:
        return TypeScript()
