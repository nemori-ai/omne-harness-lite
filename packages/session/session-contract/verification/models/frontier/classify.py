"""Classify complete TLC evidence against the named target."""
import json
import re

TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|-?\d+|\|->|<<|>>|\.\.|[\[\]{},]|[A-Za-z_]\w*')
ATOM = re.compile(r'-?\d+|[A-Za-z_]\w*|"(?:[^"\\]|\\.)*"')
VARIABLE = re.compile(r'^(?:/\\[ \t]+)?([A-Za-z_]\w*)[ \t]*=[ \t]*', re.MULTILINE)


def value_end(tokens, position):
    token = tokens[position]
    position += 1
    if token in ('[', '{', '<<'):
        closing = {'[': ']', '{': '}', '<<': '>>'}[token]
        keys = set()
        if tokens[position] == closing:
            return position + 1
        while True:
            if token == '[':
                key = tokens[position]
                if not re.fullmatch(r'[A-Za-z_]\w*', key) or key in keys:
                    raise ValueError('invalid record field')
                keys.add(key)
                if tokens[position + 1] != '|->':
                    raise ValueError('missing record value')
                position += 2
            position = value_end(tokens, position)
            if tokens[position] == closing:
                return position + 1
            if tokens[position] != ',':
                raise ValueError('invalid value separator')
            position += 1
    if not ATOM.fullmatch(token):
        raise ValueError('missing state value')
    if token.startswith('"'):
        json.loads(token)
    if position < len(tokens) and tokens[position] == '..':
        if not re.fullmatch(r'-?\d+', token) or not re.fullmatch(r'-?\d+', tokens[position + 1]):
            raise ValueError('invalid integer interval')
        position += 2
    return position


def complete_value(text):
    tokens = []
    position = 0
    for match in TOKEN.finditer(text):
        if text[position:match.start()].strip():
            return False
        tokens.append(match[0])
        position = match.end()
    if not tokens or text[position:].strip():
        return False
    try:
        return value_end(tokens, 0) == len(tokens)
    except (ValueError, IndexError, RecursionError):
        return False


def state_variables(body):
    assignments = list(VARIABLE.finditer(body))
    if not assignments or body[:assignments[0].start()].strip():
        return None
    names = set()
    for index, assignment in enumerate(assignments):
        end = assignments[index + 1].start() if index + 1 < len(assignments) else len(body)
        if assignment[1] in names or not complete_value(body[assignment.end():end]):
            return None
        names.add(assignment[1])
    return names


def complete_trace(log):
    marker = 'The behavior up to this point is:'
    if log.count(marker) != 1:
        return False
    log = log.split(marker, 1)[1]
    headers = list(re.finditer(r'^State ([0-9]+):([^\n]*)\n?', log, re.MULTILINE))
    if len(headers) < 2:
        return False
    variables = None
    for index, header in enumerate(headers):
        action = re.fullmatch(r'\s*<([^<>]+)>\s*', header[2])
        if int(header[1]) != index + 1 or not action or not action[1].strip():
            return False
        end = headers[index + 1].start() if index + 1 < len(headers) else len(log)
        body = log[header.end():end]
        if index + 1 == len(headers):
            summary = re.search(r'^\d[\d,]* states generated, ', body, re.MULTILINE)
            if summary:
                body = body[:summary.start()]
        names = state_variables(body)
        if names is None or (variables is not None and names != variables):
            return False
        variables = names
    return True


def classify(code, timed_out, log, expected):
    completion = "Model checking completed. No error has been found." in log
    violations = re.findall(r"Invariant (\w+) is violated\.", log)
    if timed_out:
        return False
    if expected is None:
        stats = re.findall(r"([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue", log)
        depth = re.search(r"The depth of the complete state graph search is [\d,]+", log)
        return bool(code == 0 and completion and not violations and "Error:" not in log
                    and stats and int(stats[-1][2].replace(",", "")) == 0 and depth)
    errors = re.findall(r"^Error: (.*)$", log, re.MULTILINE)
    expected_errors = {"Invariant " + expected + " is violated.", "The behavior up to this point is:"}
    return bool(code == 12 and not completion and violations == [expected]
                and "The behavior up to this point is:" in log
                and complete_trace(log)
                and all(message in expected_errors for message in errors))
