"""Independent pinned-Jinja oracle; no hosted-model or OpenRouter claim.

Run from the repository root with a Python environment providing Jinja2:
python3 packages/model/pi-ai-transport/tests/fixtures/zai/history-template-oracle.py \
  > packages/model/pi-ai-transport/tests/fixtures/zai/history-template-goldens.json

`goldens`: the five 2026-09-28 complete histories followed by their own authentic thought, on
the GLM-5.3 template. `visible`: every archived reasoning text of both evidence batches (the
2026-09-27 fragments fixture and the 2026-09-28 complete streams, fragments joined in order),
placed once before and once after the last user message, rendered by the three pinned
templates with reasoning_content = text and clear_thinking=False; GLM-5.2 is also rendered at
its template default (clear_thinking undefined) for the ZV4 comparison only.
"""
import hashlib
import json
from pathlib import Path
import jinja2

root = Path(__file__).resolve().parents[3]
templates_dir = root / 'tokenizers/zai-glm5'
source = Path(__file__).with_name('history-complete-streams.json')
fragments_source = Path(__file__).with_name('visible-reasoning-fragments.json')
env = jinja2.Environment(extensions=['jinja2.ext.loopcontrols'])
env.filters['tojson'] = lambda value, ensure_ascii=False: json.dumps(value, ensure_ascii=ensure_ascii)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def compiled(name):
    return env.from_string((templates_dir / name).read_text())


glm53 = compiled('glm-5.3-chat-template.jinja')
templates = {
    'glm-5.2': 'glm-5.2-chat-template.jinja',
    'glm-5.3': 'glm-5.3-chat-template.jinja',
    'glm-5.3-flash': 'glm-5.3-flash-chat-template.jinja',
}
rendered_by = {name: compiled(file) for name, file in templates.items()}


def jinja_messages(wire):
    """Wire (OpenRouter) messages to the template's local form."""
    messages = json.loads(json.dumps(wire))
    for message in messages:
        if 'reasoning' in message:
            message['reasoning_content'] = message.pop('reasoning')
        # Public local template takes parsed function arguments; wire uses a JSON string.
        for call in message.get('tool_calls', []):
            call['function']['arguments'] = json.loads(call['function']['arguments'])
    return messages


results = []
for row in json.loads(source.read_text()):
    messages = row['request']['messages'] + [
        {'role': 'assistant', 'content': row['content'], 'reasoning_content': row['thought']},
        {'role': 'user', 'content': 'What arithmetic result did we verify?'},
    ]
    for message in messages:
        for call in message.get('tool_calls', []):
            call['function']['arguments'] = json.loads(call['function']['arguments'])
    rendered = glm53.render(messages=messages, tools=row['request']['tools'], add_generation_prompt=True, clear_thinking=False)
    results.append({'id': row['id'], 'promptSha256': sha(rendered.encode())})

texts = []
for stream in json.loads(fragments_source.read_text())['streams']:
    member = stream['member'].rsplit('/', 1)[-1].split('-', 1)[0]
    texts.append({'source': stream['member'], 'id': member, 'text': ''.join(stream['fragments'])})
for row in json.loads(source.read_text()):
    texts.append({'source': row['source'], 'id': row['id'], 'text': row['thought']})

tools = [{
    'type': 'function',
    'function': {
        'name': 'lookup__exact',
        'description': 'Look up an exact value',
        'parameters': {
            'type': 'object',
            'properties': {'query': {'type': 'string'}},
            'required': ['query'],
            'additionalProperties': False,
        },
    },
}]
cases = []
for item in texts:
    for geometry in ('before-last-user', 'after-last-user'):
        if geometry == 'before-last-user':
            wire = [
                {'role': 'system', 'content': 'Answer briefly.'},
                {'role': 'user', 'content': 'Turn 1.'},
                {'role': 'assistant', 'content': 'Answer 1.', 'reasoning': item['text']},
                {'role': 'user', 'content': 'Turn 2.'},
            ]
        else:
            wire = [
                {'role': 'system', 'content': 'Answer briefly.'},
                {'role': 'user', 'content': 'Turn 1.'},
                {
                    'role': 'assistant',
                    'content': '',
                    'reasoning': item['text'],
                    'tool_calls': [{
                        'id': 'call_1',
                        'type': 'function',
                        'function': {'name': 'lookup__exact', 'arguments': '{"query":"value"}'},
                    }],
                },
                {'role': 'tool', 'tool_call_id': 'call_1', 'content': 'value=42'},
            ]
        prompts = {}
        for name, template in rendered_by.items():
            prompts[name] = sha(template.render(messages=jinja_messages(wire), tools=tools, add_generation_prompt=True, clear_thinking=False).encode())
        prompts['glm-5.2-default'] = sha(rendered_by['glm-5.2'].render(messages=jinja_messages(wire), tools=tools, add_generation_prompt=True).encode())
        cases.append({'id': f"{item['id']}-{geometry}", 'source': item['source'], 'geometry': geometry, 'messages': wire, 'prompts': prompts})

print(json.dumps({
    'jinja2': jinja2.__version__,
    'templateSha256': sha((templates_dir / templates['glm-5.3']).read_bytes()),
    'historiesSha256': sha(source.read_bytes()),
    'goldens': results,
    'visible': {
        'fragmentsSha256': sha(fragments_source.read_bytes()),
        'templateSha256': {name: sha((templates_dir / file).read_bytes()) for name, file in templates.items()},
        'tools': tools,
        'cases': cases,
    },
}, ensure_ascii=False, indent=2))
