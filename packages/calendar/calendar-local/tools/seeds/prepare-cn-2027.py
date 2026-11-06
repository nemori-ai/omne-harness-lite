"""Prepare a new release from retained official paragraphs and pinned oracle bytes."""
import concurrent.futures
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[2] / 'data/seeds'
COMMIT = 'f1df4fd27767202eb2cf24ca32c8dec534a64159'
URL = 'https://www.gov.cn/zhengce/content/202611/content_7085101.htm'
LINEAGE = 'State Council annual notice from gov.cn; retained original and deterministic transcription, independent of the cg-zhou transcription pipeline'


def digest(content):
    return hashlib.sha256(content).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


class Paragraphs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.paragraphs = []

    def handle_starttag(self, tag, attrs):
        if tag == 'p':
            self.current = []

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == 'p' and self.current is not None:
            self.paragraphs.append(''.join(self.current).strip())
            self.current = None


def parse_notice(content):
    parser = Paragraphs()
    parser.feed(content)
    entries = []
    names = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节']
    for paragraph in parser.paragraphs:
        if not re.match(r'^[一二三四五六七]、', paragraph):
            continue
        title, body = paragraph.split('：', 1)
        clean = re.sub(r'（[^）]*）', '', body)
        match = re.match(r'(\d+)月(\d+)日(?:至(?:(\d+)月)?(\d+)日)?放假(?:调休)?，共(\d+)天。', clean)
        if not match:
            raise ValueError(f'Unrecognized notice paragraph: {paragraph}')
        month, day, end_month, end_day, duration = match.groups()
        start = datetime.date(2027, int(month), int(day))
        end = datetime.date(2027, int(end_month or month), int(end_day or day))
        assert (end - start).days + 1 == int(duration)
        remainder = clean[match.end():]
        comp = []
        if remainder:
            if not re.fullmatch(r'\d+月\d+日(?:、\d+月\d+日)*上班。', remainder):
                raise ValueError(f'Unrecognized workday sentence: {remainder}')
            comp = [datetime.date(2027, int(m), int(d)).isoformat() for m, d in re.findall(r'(\d+)月(\d+)日', remainder)]
        entries.append(dict(Name=title.split('、')[1], StartDate=str(start), EndDate=str(end), Duration=int(duration), CompDays=comp, URL=URL, Memo=paragraph))
    assert [item['Name'] for item in entries] == names, 'Expected exactly seven complete holiday paragraphs'
    assert '国务院办公厅关于2027年部分节假日安排的通知' in content
    return entries


def fetch(path):
    url = f'https://raw.githubusercontent.com/cg-zhou/holiday-calendar/{COMMIT}/{path}'
    with urllib.request.urlopen(url, timeout=30) as response:
        return path, response.read().decode('utf-8')


def main():
    acquired = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    official = (ROOT / 'evidence/gov-cn-2027.html').read_bytes()
    record = json.loads((ROOT / 'evidence/gov-cn-2027-records.json').read_text())[0]
    assert digest(official) == record['sha256'] and record['url'] == URL
    entries = parse_notice(official.decode('utf-8'))
    supplement = (ROOT / 'raw/chinese-days-1.5.10.json').read_bytes()
    days = json.loads(supplement)
    holiday_dates = {str(datetime.date.fromisoformat(e['StartDate']) + datetime.timedelta(days=i)) for e in entries for i in range(e['Duration'])}
    work_dates = {d for e in entries for d in e['CompDays']}
    assert holiday_dates == {d for d in days['holidays'] if d.startswith('2027-')}
    assert work_dates == {d for d in days['workdays'] if d.startswith('2027-')}
    bundle = {'format': 'gov_cn_annual_notice/v1', 'primary': json.dumps({'Years': {'2027': entries}}, ensure_ascii=False), 'supplement': {'sourceId': 'chinese-days', 'version': '1.5.10', 'coverageStart': '2004-01-01', 'coverageEnd': '2027-12-31', 'reference': 'https://registry.npmjs.org/chinese-days/1.5.10', 'sha256': digest(supplement), 'content': supplement.decode('utf-8')}}
    write_json(ROOT / 'raw/gov-cn-2027-bundle.json', bundle)
    _, index_text = fetch('data/index.json')
    region = next(r for r in json.loads(index_text)['regions'] if r['name'] == 'CN')
    assert region['endYear'] == 2027
    paths = [f'data/CN/{year}.json' for year in range(region['startYear'], region['endYear'] + 1)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        years = dict(pool.map(fetch, paths))
    cg = {'format': 'cg_zhou_year_bundle/v1', 'index': index_text, 'years': years}
    write_json(ROOT / 'raw/cg-bundle-2027.json', cg)
    (ROOT / 'raw/cg-index-2027.json').write_text(index_text)
    oracle = json.loads(years['data/CN/2027.json'])['dates']
    assert holiday_dates == {r['date'] for r in oracle if r['type'] == 'public_holiday'}
    assert work_dates == {r['date'] for r in oracle if r['type'] == 'transfer_workday'}
    evidence = {'official': record, 'officialKnowledgeAsOf': '2026-11-05T09:00:00.000Z', 'knowledgeBasis': 'gov.cn firstpublishedtime=2026-11-05-17:00:00 Asia/Shanghai', 'oracleCommit': COMMIT, 'oracleFiles': {p: digest(v.encode()) for p, v in years.items()}, 'oracleIndexHash': digest(index_text.encode()), 'acquiredAt': acquired, 'holidayDays': len(holiday_dates), 'compensatoryDays': len(work_dates), 'independence': 'Official notice extraction and cg-zhou maintained per-year JSON are separate acquisition/transcription paths. Both refer to the same legal authority; this does not claim two independent lawmakers. chinese-days is supplemental evidence, not the oracle.'}
    write_json(ROOT / 'evidence/cn-2027-adoption.json', evidence)
    inputs = json.loads((ROOT / 'inputs.json').read_text())
    inputs.update(releaseRef='calendar-2026-11-06', releaseDate='2026-11-06', generatedAt=acquired)
    inputs['materials'].append(dict(sourceId='gov-cn-annual-notice', file='raw/gov-cn-2027-bundle.json', sha256=digest((ROOT / 'raw/gov-cn-2027-bundle.json').read_bytes()), knowledgeAsOf=evidence['officialKnowledgeAsOf'], acquiredAt=acquired, lineageRef=LINEAGE, authorityRef=URL, mediaType='application/json'))
    for material in inputs['materials']:
        if material['sourceId'] in ['cg-zhou-holiday-calendar', 'cg-zhou-index-endyear']:
            material['file'] = 'raw/cg-bundle-2027.json' if material['sourceId'] == 'cg-zhou-holiday-calendar' else 'raw/cg-index-2027.json'
            material.update(sha256=digest((ROOT / material['file']).read_bytes()), knowledgeAsOf='2026-11-05T11:37:50.000Z', acquiredAt=acquired, authorityRef=f'https://github.com/cg-zhou/holiday-calendar/commit/{COMMIT}')
    inputs['calendars'][0]['authorityCoverageEnd'] = '2027-12-31'
    inputs['independenceRegistry'].append(dict(truthSourceId='gov-cn-annual-notice', oracleSourceId='cg-zhou-holiday-calendar', independent=True, evidenceRef='calendar-seed-lineage:gov-cn:2027'))
    write_json(ROOT / 'inputs-2026-11-06.json', inputs)
    provenance = json.loads((ROOT / 'provenance.json').read_text())
    provenance.update(releaseDate='2026-11-06', scope='CN 2027 official extension; unchanged JP/US source observations')
    retained = ['evidence/gov-cn-2027.html', 'evidence/gov-cn-2027-records.json', 'evidence/cn-2027-adoption.json', 'evidence/chinese-days-1.5.10-LICENSE', 'evidence/chinese-days-1.5.10-package.json']
    provenance['evidence'] += [dict(file=p, sha256=digest((ROOT / p).read_bytes())) for p in retained]
    provenance['independence'].append(dict(id='calendar-seed-lineage:gov-cn:2027', basis=evidence['independence'], evidence=retained[:3]))
    provenance['sources'].append(dict(sourceId='gov-cn-annual-notice', url=URL, knowledgeAsOf=evidence['officialKnowledgeAsOf'], knowledgeBasis=evidence['knowledgeBasis'], evidence=retained))
    for source in provenance['sources']:
        if source['sourceId'] == 'cg-zhou-holiday-calendar':
            source.update(version=COMMIT, knowledgeAsOf='2026-11-05T11:37:50Z', knowledgeBasis='Immutable commit; full CN 2000-2027 index captured', url=f'https://github.com/cg-zhou/holiday-calendar/tree/{COMMIT}', evidence=['evidence/cn-2027-adoption.json', 'evidence/cg-LICENSE'])
    write_json(ROOT / 'provenance-2026-11-06.json', provenance)
    print(json.dumps({'holidays': len(holiday_dates), 'compensatory': len(work_dates), 'oracleRows': len(oracle), 'agreement': True}))


if __name__ == '__main__':
    main()
