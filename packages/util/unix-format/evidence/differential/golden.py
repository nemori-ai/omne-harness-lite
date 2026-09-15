"""Render the differential fixtures with the ORIGINAL Python implementation.

Run from an omne-next checkout at commit 6263fed545e48ad9efb5714f3fe76a7c1a0af1b5 whose
virtual environment can import ``omne_core_v1``::

    /path/to/omne-next/.venv/bin/python golden.py > golden.json

``tests/differential.spec.ts`` renders the same fixtures with the TypeScript port and
compares byte for byte; every case under ``same`` must be identical.
"""

from __future__ import annotations

import json
import sys

from omne_core_v1.data_model.unix_format import (
    UnixFormatOptions,
    format_bullet_list,
    format_command_list,
    format_error,
    format_hold,
    format_key_value,
    format_numbered_lines,
    format_section,
    format_success,
    format_table,
    format_usage,
)


def build() -> dict[str, dict[str, str]]:
    same: dict[str, str] = {}

    same["error_plain"] = format_error("Operation failed.")
    same["error_hint"] = format_error("Operation failed.", hint="Try 'retry' command.")
    same["error_multiline"] = format_error("line 1\nline 2", hint="check docs")
    same["error_empty"] = format_error("")
    same["error_empty_hint"] = format_error("boom", hint="")
    same["hold_plain"] = format_hold("Read help first.")
    same["hold_empty_steps"] = format_hold("msg", steps=[])
    same["hold_steps"] = format_hold("Before install:", steps=["Read skill doc", "Set i_have_read_skill=true"])
    same["hold_newline_step"] = format_hold("m", steps=["line1\nline2"])
    same["ok_plain"] = format_success("Installed v1.0.")
    same["ok_hint"] = format_success("Installed v1.0.", hint="Run 'list' to verify.")
    same["ok_empty"] = format_success("", hint="")
    same["section_md"] = format_section("SYNOPSIS", "my_tool command [params]")
    same["section_plain"] = format_section("SYNOPSIS", "my_tool command [params]", options=UnixFormatOptions(markdown_compatible=False))
    same["section_indent4_blank"] = format_section("DESC", "line 1\n\nline 2", options=UnixFormatOptions(markdown_compatible=False, indent=4))
    same["usage"] = format_usage("manage_skills", "install", "{name, version?}")
    same["usage_quotes"] = format_usage("tool", "x", '{"name": "x"}')
    same["cmdlist"] = format_command_list(
        [
            ("init", "{name}", "Create a workspace."),
            ("mount", "{workspace_id}", "Mount an existing workspace."),
            ("help", "(no params)", "Show command reference."),
        ]
    )
    same["cmdlist_empty"] = format_command_list([])
    same["cmdlist_empty_synopsis"] = format_command_list([("solo", "", "desc")])
    same["cmdlist_emoji"] = format_command_list([("😀", "a", "d"), ("ab", "b", "e")])
    same["table_basic"] = format_table(["Name", "Version"], [("alpha", "1.0"), ("beta", "2.1.3")])
    same["table_header_only"] = format_table(["Name"], [])
    same["table_empty"] = format_table([], [])
    same["table_widen"] = format_table(["X", "Y"], [("long_value_here", "short")])
    same["table_overflow"] = format_table(["AAAA", "BBBB"], [("x" * 13, "y" * 13)], max_width=10)
    same["table_slack"] = format_table(["AAAAA", "BBBBB", "CCCCC"], [("xxxxx", "yyyyy", "zzzzz")], max_width=10)
    same["table_default_cap"] = format_table(["A", "B"], [("x" * 100, "y" * 100)])
    same["table_nocap"] = format_table(["A"], [("x" * 200,)], max_width=0)
    same["table_fits"] = format_table(["A", "B"], [("short", "short")], options=UnixFormatOptions(max_width=40))
    same["table_cjk"] = format_table(["名称", "版本"], [("中文内容", "1.0"), ("foo", "贰.零")])
    same["kv"] = format_key_value({"name": "alpha", "version": "1.0"})
    same["kv_empty"] = format_key_value({})
    same["kv_empty_key"] = format_key_value({"": "value"})
    same["kv_newline"] = format_key_value({"k": "line1\nline2"})
    same["bullets"] = format_bullet_list(["one", "two", "three"])
    same["bullets_empty"] = format_bullet_list([])
    same["bullets_newline"] = format_bullet_list(["line1\nline2", "third"])
    same["num_empty"] = format_numbered_lines([])
    same["num_basic"] = format_numbered_lines(["alpha", "beta"])
    same["num_start"] = format_numbered_lines(["eight", "nine"], start=8)
    same["num_wide"] = format_numbered_lines(["a", "b"], start=999_999)
    same["num_wide2"] = format_numbered_lines(["a", "b"], start=9_999_999)
    same["num_sep"] = format_numbered_lines(["alpha"], separator=":")
    same["num_trunc"] = format_numbered_lines(["x" * 40, "short"], per_line_char_limit=10)
    same["num_trunc_keep"] = format_numbered_lines(["y" * 50, "z" * 50], per_line_char_limit=5)
    same["num_at_limit"] = format_numbered_lines(["12345"], per_line_char_limit=5)
    same["num_maxwidth"] = format_numbered_lines(["x" * 40], options=UnixFormatOptions(max_width=20))
    same["num_maxwidth0"] = format_numbered_lines(["x" * 40], options=UnixFormatOptions(max_width=0))
    same["num_default_nocap"] = format_numbered_lines(["x" * 200])
    same["num_emoji"] = format_numbered_lines(["😀😀😀"], per_line_char_limit=2)

    return {"same": same}


json.dump(build(), sys.stdout, ensure_ascii=False, indent=2)
sys.stdout.write("\n")
