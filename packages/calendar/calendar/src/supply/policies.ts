import type { CalendarSupplyPolicy } from './types.ts'

export const supplyPolicySource = {
  commit: 'a7dbd98f9c5c7a8ead6afbd18896777f0cf1ecd0',
  path: 'omne_harness/libs/omne_harness_state/omne_harness_state/application/calendar_supply_configs.py',
  rawSha256: '8a26db22e0728ed5ee3c367ab36072f4827f21ee3bb5bbe6fd4af161bf4475df',
}

export const shippedCalendarSupplyPolicies: readonly CalendarSupplyPolicy[] = [
  {
    calendarId: 'cn-legal-holidays',
    timezone: 'Asia/Shanghai',
    weeklyDefault: [
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'nonWorkingDay',
      'nonWorkingDay',
    ],
    sources: [
      {
        sourceId: 'gov-cn-annual-notice',
        role: 'truth',
        adapterKind: 'gov_cn_annual_notice_json',
        provenanceClass: 'firstPartyAuthority',
        lineage:
          'State Council annual notice from gov.cn; retained original and deterministic transcription, independent of the cg-zhou transcription pipeline',
        transport: { artifact: 'explicitly adopted annual notice archive' },
        decoding: { format: 'json', encoding: 'utf-8' },
        parsing: {
          format: 'gov_cn_annual_notice/v1',
          coverage: 'complete declared annual notices; no inferred future year',
        },
        probeCadence: { defaultInterval: { days: 1 }, segments: [] },
        licenseNote: 'Official public notice; retained as authority evidence',
      },
      {
        sourceId: 'lanceliao-china-holiday-calender',
        role: 'truth',
        adapterKind: 'lanceliao_holiday_api_json',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          "Hand-maintained transcription of gov.cn State Council annual holiday notices; every entry carries a gov.cn URL backlink and quotes the notice's Memo sentence verbatim (machine-checkable per entry)",
        transport: {
          repository: 'lanceliao/china-holiday-calender',
          artifactPath: 'holidayAPI.json',
          origins: ['github_raw', 'jsdelivr_cdn'],
          backupOriginNote: 'author mirror shuyz.com — availability unverified (dossier: 未能确证)',
          timeoutSeconds: 30,
        },
        decoding: {
          format: 'json',
          encoding: 'utf-8',
        },
        parsing: {
          generatedFieldNote:
            "'Generated' carries a bogus Z suffix but is Asia/Shanghai local time (measured 8h offset vs pushed_at) — never authoritative; use HTTP Last-Modified / GitHub pushed_at instead",
          entrySelfCheck: 'Duration == (EndDate - StartDate).days + 1',
          coverageDerivation:
            'coverage_start and every day come from the actual entry date range, never from year keys; the year keys are read only as the announcement evidence gating coverage_ceiling',
          compDaysField: 'CompDays',
          coverageCeiling: 'announced_year_end',
          coverageCeilingBasis:
            "Declared source assumption, reviewable here and closable here — not a check the artifact supports. The State Council publishes one atomic annual notice, so a year the artifact announces at all it announces in full, and days after the last entry are regular weekly-default days rather than unknowns; the horizon policy's own '12-20 WARNING / 01-01 exhausted' arithmetic presupposes this year-end coverage. What the adapter does check is the artifact's own Years declaration, so a compensatory day spilling into an unannounced next year never ceils. What it cannot check is whether an announced year was transcribed completely: a partial transcription of the newest year would still be published as authoritative for that whole year, bounded only by cn.annual_holiday_days_floor / cn.annual_holiday_days_band (measured 2004-2026 band 22-33; a 20-25 day transcription passes both). Closing that residual needs a signal outside this adapter's pure-parse boundary — the cg-zhou-index-endyear probe's declared endYear is the candidate, and consuming it is a synthesis-layer change, not an adapter one",
        },
        probeCadence: {
          defaultInterval: {
            days: 7,
          },
          segments: [
            {
              window: {
                startMonthDay: '10-01',
                endMonthDay: '12-31',
                note: 'annual-notice window: 4 measured publication days 10-25 / 11-04 / 11-12 / 12-16 — never cut at end of November',
              },
              interval: {
                days: 1,
              },
            },
            {
              window: {
                startMonthDay: '01-01',
                endMonthDay: '05-31',
                note: 'override-document high season (three measured overrides in Jan / Mar / May) — weekly sweep is never skipped',
              },
              interval: {
                days: 7,
              },
            },
            {
              window: {
                startMonthDay: '06-01',
                endMonthDay: '09-30',
                note: 'backstop sweep: catches historical errata and one-off events',
              },
              interval: {
                days: 7,
              },
            },
          ],
        },
        licenseNote:
          "No LICENSE (GitHub license field null, measured 2026-08-19); adoption waits on no licence clarification per the 2026-08-19 authority ruling (ADR-107 Amendment A-1); GitHub's own documentation reads no-LICENSE as all-rights-reserved by default (Amendment A-2 neutral note)",
      },
      {
        sourceId: 'cg-zhou-holiday-calendar',
        role: 'oracle',
        adapterKind: 'cg_zhou_holiday_calendar_json',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          'Independently maintained per-year JSON data (cg-zhou, MIT) with its own data pipeline; no gov.cn backlinks in data files; acquisition surface fully disjoint from the lanceliao artifact',
        transport: {
          repository: 'cg-zhou/holiday-calendar',
          artifactPathPattern: 'data/CN/{year}.json',
          timeoutSeconds: 30,
        },
        decoding: {
          format: 'json',
          encoding: 'utf-8',
        },
        parsing: {
          rowSchema: '{date, name, name_cn, name_en, type}',
          documentEnvelopeNote:
            "a year file is a '{year, region, dates[]}' envelope, never a bare row list (2026-08-21 real-network measurement; the first fixtures fabricated the bare-list shape and the adapter failed on every real file)",
          typeVocabulary: ['public_holiday', 'transfer_workday'],
          historyCaveat:
            '2026-03-06 shipped three same-day patches correcting 2010-2019 history (including a wholly missed 2015 V-Day holiday) — historical intervals are not implicitly trustworthy',
        },
        probeCadence: {
          defaultInterval: {
            days: 7,
          },
          segments: [],
        },
        licenseNote: 'MIT',
      },
      {
        sourceId: 'cg-zhou-index-endyear',
        role: 'horizonProbe',
        adapterKind: 'cg_zhou_index_json',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          'Same repository as the cg-zhou oracle: the 181-byte data/index.json declaring per-region endYear',
        transport: {
          repository: 'cg-zhou/holiday-calendar',
          artifactPath: 'data/index.json',
          timeoutSeconds: 10,
        },
        decoding: {
          format: 'json',
          encoding: 'utf-8',
        },
        parsing: {
          horizonField: 'regions[name=CN].endYear',
          signal: 'an endYear jump is the sufficient-and-necessary new-data signal',
        },
        probeCadence: {
          defaultInterval: {
            days: 1,
          },
          segments: [],
        },
        licenseNote: 'MIT',
      },
    ],
    validation: {
      invariants: [
        {
          invariantId: 'cn.compensatory_workday_on_weekend',
          severity: 'blocker',
          description:
            'A compensatory working day always falls on a weekend — 150/150 over 2004-2026, zero counterexamples; the legality characterization of the swap mechanism',
          params: {},
        },
        {
          invariantId: 'cn.holiday_and_compensatory_disjoint',
          severity: 'blocker',
          description: 'Holiday set and compensatory-workday set never intersect (full history)',
          params: {},
        },
        {
          invariantId: 'cn.in_lieu_subset_of_holidays',
          severity: 'blocker',
          description: 'In-lieu days are a subset of holidays — 151/151 over the full history',
          params: {},
        },
        {
          invariantId: 'cn.entry_self_consistency',
          severity: 'blocker',
          description: 'Every entry satisfies Duration == (EndDate - StartDate).days + 1',
          params: {},
        },
        {
          invariantId: 'cn.annual_holiday_days_floor',
          severity: 'blocker',
          description:
            'Annual holiday days never fall below the statutory floor — the positive defence against the degraded-to-no-holidays failure shape',
          params: {
            min: 13,
          },
        },
        {
          invariantId: 'cn.annual_holiday_days_band',
          severity: 'warning',
          description:
            'Annual holiday days within the 2004-2026 full-history band (measured min 22 / max 33)',
          params: {
            min: 20,
            max: 36,
          },
        },
        {
          invariantId: 'cn.annual_compensatory_days_band',
          severity: 'warning',
          description:
            'Annual compensatory days within the full-history band (measured min 5 / max 12; 2013 had 12)',
          params: {
            min: 3,
            max: 14,
          },
        },
        {
          invariantId: 'cn.compensatory_in_lieu_near_zero_sum',
          severity: 'warning',
          description:
            'Compensatory days approximately equal in-lieu days (18 of 23 years exactly equal)',
          params: {
            maxDelta: 2,
          },
        },
        {
          invariantId: 'cn.longest_holiday_block',
          severity: 'warning',
          description:
            'Longest consecutive holiday block within the measured band (2019-2026 max 10)',
          params: {
            max: 11,
          },
        },
      ],
      anchors: [
        {
          anchorId: 'cn.new_year',
          monthDay: '01-01',
          expectedCategory: 'holiday',
          toleranceDays: 0,
          note: null,
        },
        {
          anchorId: 'cn.national_day_1',
          monthDay: '10-01',
          expectedCategory: 'holiday',
          toleranceDays: 0,
          note: null,
        },
        {
          anchorId: 'cn.national_day_2',
          monthDay: '10-02',
          expectedCategory: 'holiday',
          toleranceDays: 0,
          note: null,
        },
        {
          anchorId: 'cn.national_day_3',
          monthDay: '10-03',
          expectedCategory: 'holiday',
          toleranceDays: 0,
          note: null,
        },
      ],
      unsourcedOverlapDisposition: 'withheld',
      coverageShrinkDisposition: 'rejected',
      oracleDivergenceDisposition: 'withheld',
    },
    horizon: {
      warningFloorDays: 11,
      criticalFloorDays: 0,
      expectedExtensionWindow: {
        startMonthDay: '10-01',
        endMonthDay: '12-31',
        note: 'annual notice historically lands 10-25 through 12-16',
      },
      note: 'WARNING at 12-20 (11 days remaining) / CRITICAL at 01-01 (exhausted): the 2015 notice landed 2014-12-16 with 16 days remaining, so any floor before mid-December false-alarms a late-but-real year; measured source lag ~0 days',
      criticalComparison: 'exclusive',
    },
    semanticBoundary:
      'Does not express partial-population half-day holidays (妇女节 / 青年节 etc.) or regional ethnic holidays (ADR-107 D-8 non-goal); Hong Kong / Macao / Taiwan are separate calendar identities outside this batch',
  },
  {
    calendarId: 'jp-legal-holidays',
    timezone: 'Asia/Tokyo',
    weeklyDefault: [
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'nonWorkingDay',
      'nonWorkingDay',
    ],
    sources: [
      {
        sourceId: 'cao-syukujitsu-csv',
        role: 'truth',
        adapterKind: 'cao_syukujitsu_csv',
        provenanceClass: 'firstPartyAuthority',
        lineage:
          "The Cabinet Office's own publication surface — the government original itself (1955-2027, 1067 rows), not a transcription of anything",
        transport: {
          url: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
          urlPinningNote:
            'URL must stay pinned to syukujitsu.csv: the legacy syukujitsu_kyujitsu.csv still returns 200 with legal format and data frozen at 2019 — the dominant failure shape, live',
          probeMethod:
            'daily HEAD comparing the (Last-Modified, ETag, Content-Length) triple; conditional GET is broken (measured: 200 full body despite validators); a triple change triggers full GET with content hash as final judge (the 2022-11 site migration flattened mtimes wholesale)',
          timeoutSeconds: 30,
        },
        decoding: {
          encoding: 'cp932',
          contentTypeNote:
            'Content-Type: text/csv without charset — encoding lives only in this config',
          newline: 'CRLF',
          bom: 'none',
        },
        parsing: {
          dateFormat:
            'YYYY/M/D without zero padding (893/1067 rows non-padded — strict %Y/%m/%d would break)',
          header:
            'two-column header names validated; the schema was remade once between 2018-2019 — a change fails loud',
          rows: '振替休日 and 国民の休日 are already explicit rows — pure carriage, zero derivation',
          coverageCeiling: 'announced_year_end',
          coverageCeilingBasis:
            "Declared source assumption, reviewable here and closable here — not a check the document supports. 官報 promulgates a whole year at once and the CSV is the complete statutory list, so the newest row's year answers through its December 31; the horizon note's own trough arithmetic (334 days) presupposes that. Unlike the Chinese artifact this CSV carries no structure separating a fully promulgated year from a truncated one, and the one in-document tell ('no holiday follows 勤労感謝の日 on 11-23') holds by accident of the Japanese calendar, so it is deliberately not relied on. The residual — a truncated newest year published as authoritative — is bounded only by jp.annual_holiday_count_floor",
        },
        probeCadence: {
          defaultInterval: {
            days: 1,
          },
          segments: [
            {
              window: {
                startMonthDay: '01-20',
                endMonthDay: '02-20',
                note: 'publication window: five measured years all landed at 02-01 (or next business day); probing outside the window stays on — the 2020-11-27 Olympics special law changed the published interval outside any window',
              },
              interval: {
                hours: 6,
              },
            },
          ],
        },
        licenseNote:
          "政府標準利用規約 2.0 per the standard-terms text; the Cabinet Office's own copyright page returned 404 at research time (dossier: 未能确证) — re-confirm at implementation",
      },
      {
        sourceId: 'vacanza-holidays-library',
        role: 'oracle',
        adapterKind: 'vacanza_holidays_library',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          'vacanza `holidays` PyPI library — derived from Wikipedia and Bank of Japan sources and never reads the Cabinet Office CSV (measured: 1067/1067 date agreement over 1955-2027 with fully independent descent)',
        transport: {
          package: 'holidays',
          distribution: 'pypi',
          note: 'in-process computed acquisition — a computed source speaks the same adapter contract',
        },
        decoding: {
          format: 'python_mapping',
        },
        parsing: {
          yearAssertion:
            'the library silently returns an empty mapping outside its supported range — the adapter must assert the requested years are supported and fail loud beyond them (the sealed fail-open)',
        },
        probeCadence: {
          defaultInterval: {
            days: 7,
          },
          segments: [],
        },
        licenseNote: 'MIT',
      },
    ],
    validation: {
      invariants: [
        {
          invariantId: 'jp.annual_holiday_count_floor',
          severity: 'blocker',
          description:
            'Annual national-holiday count never collapses below the statutory floor — the positive defence against the degraded-to-no-holidays shape. The floor holds from 1995 onward: the full 1955-2027 CSV history (measured 2026-08-21) has 33 years below 15, the last being 1994 with 14, and every year from 1995 carries 15 or more — the amendment boundary is dossier data, not a tuning knob',
          params: {
            min: 15,
            effectiveFromYear: 1995,
          },
        },
        {
          invariantId: 'jp.no_working_day_overrides',
          severity: 'blocker',
          description:
            'Japan has no swap mechanism: a candidate carrying any working-day override is illegal — sparse vocabulary use is the normal shape',
          params: {},
        },
        {
          invariantId: 'jp.oracle_daily_diff_zero_baseline',
          severity: 'warning',
          description:
            'The CSV-vs-vacanza daily diff baseline is exactly zero — any non-zero diff alerts (catches both our decode bugs and CSV tampering)',
          params: {
            maxDiffDays: 0,
          },
        },
      ],
      anchors: [
        {
          anchorId: 'jp.labour_thanksgiving',
          monthDay: '11-23',
          note: '勤労感謝の日 — present in every year of the 1955-2027 history',
          expectedCategory: 'holiday',
          toleranceDays: 0,
        },
        {
          anchorId: 'jp.new_year',
          monthDay: '01-01',
          expectedCategory: 'holiday',
          toleranceDays: 0,
          note: null,
        },
      ],
      unsourcedOverlapDisposition: 'withheld',
      coverageShrinkDisposition: 'rejected',
      oracleDivergenceDisposition: 'withheld',
    },
    horizon: {
      warningFloorDays: 300,
      criticalFloorDays: 270,
      expectedExtensionWindow: {
        startMonthDay: '01-20',
        endMonthDay: '02-20',
        note: 'the annual +12-month jump lands at 02-01 (or the next business day)',
      },
      note: 'Sawtooth horizon 11-23 months, trough 334 days just before the February extension: 300 days means the window passed without extension (design anchor); the 270-day critical floor is a policy escalation choice one month later — the design names no measured critical anchor for Japan',
      criticalComparison: 'inclusive',
    },
    semanticBoundary:
      '国民の祝日・休日 only (including 振替休日 and 国民の休日); bank closure days (12/29-1/3) are not in this calendar — a future jp-banking-days is a separate calendar identity',
  },
  {
    calendarId: 'us-federal-holidays',
    timezone: 'America/New_York',
    weeklyDefault: [
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'workingDay',
      'nonWorkingDay',
      'nonWorkingDay',
    ],
    sources: [
      {
        sourceId: 'usc-6103-computed-rules',
        role: 'truth',
        adapterKind: 'us_federal_rules_computed',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          'Rule encoding transcribed from statute text: 5 U.S.C. §6103(a) (11 legal holidays) + §6103(b) Saturday→Friday + EO 11582 §3(a) Sunday→Monday; every computed contribution cites its statutory basis per entry',
        transport: {
          statuteReferenceUrl:
            'https://www.govinfo.gov/content/pkg/USCODE-2023-title5/html/USCODE-2023-title5-partIII-subpartE-chap61-subchapI-sec6103.htm',
          note: 'computed source — the transport surface only anchors the quarterly statute-text diff',
        },
        decoding: {
          format: 'computed',
        },
        parsing: {
          rules:
            '§6103(a) 11 holidays; §6103(b) Sat→Fri observed shift; EO 11582 §3(a) Sun→Mon observed shift',
          inaugurationDay:
            'a DC/MD/VA regional semantic (not a nationwide federal holiday) — excluded from day classification, recorded as provenance note only (OQ-2: first batch is federal-only)',
        },
        probeCadence: {
          defaultInterval: {
            days: 90,
          },
          segments: [],
        },
        licenseNote: 'US statute text — public domain',
      },
      {
        sourceId: 'opm-federal-holidays-ics',
        role: 'oracle',
        adapterKind: 'opm_holidays_ics',
        provenanceClass: 'firstPartyAuthority',
        lineage:
          "OPM's own published ICS of observed federal holiday dates (2021-2030, 112 VEVENTs) — a government publication surface whose acquisition is fully disjoint from the statute-rule computation",
        transport: {
          url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/holidays.ics',
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          userAgentNote:
            'an explicit browser User-Agent is mandatory — the default curl UA gets HTTP 403 from Akamai (dossier-measured; re-confirmed 2026-08-21)',
          contentTypeCheck: 'text/calendar',
          contentTypeNote:
            'anything else fails loud — an HTTP 200 HTML error page is a live failure shape, never parsed as calendar data',
          timeoutSeconds: 30,
        },
        decoding: {
          format: 'icalendar',
        },
        parsing: {
          dateField:
            'DTSTART only — never match on SUMMARY strings (apostrophes mix U+0027/U+2019 across years; name matching silently drops specific years)',
          uidNote:
            'UID is not used as an increment key (cross-version stability unverified — dossier: 未能确证)',
          goldenSet: 'the 112 observed dates 2021-2030 double as the reconciliation test fixture',
        },
        probeCadence: {
          defaultInterval: {
            days: 30,
          },
          segments: [],
        },
        licenseNote: 'US government work — public domain',
      },
      {
        sourceId: 'federal-register-eo-feed',
        role: 'exceptionFeed',
        adapterKind: 'federal_register_eo_api',
        provenanceClass: 'thirdPartyTranscription',
        lineage:
          'Federal Register API — the official electronic edition of presidential documents; every contribution carries document_number / executive_order_number as its per-entry machine-checkable reference',
        transport: {
          url: 'https://www.federalregister.gov/api/v1/documents.json',
          auth: 'none',
          query:
            'conditions[presidential_document_type][]=executive_order&order=newest&per_page=1000&fields[]=document_number&fields[]=title&fields[]=publication_date&fields[]=signing_date&fields[]=raw_text_url&fields[]=executive_order_number',
          queryNote:
            "the list endpoint's default fields omit raw_text_url / signing_date / executive_order_number (measured 2026-08-21: the first real acquisition failed on a fields-starved hit), so every field the adapter consumes is requested explicitly; per_page=1000 keeps the anchored scan within the adapter's page ceiling (unbounded, the EO list is 1,556 documents over 50 pages; anchored at 2025 it is 289 documents on one page, measured 2026-08-21); the adapter itself appends the anchored conditions[publication_date][gte] scan floor",
          timeoutSeconds: 30,
        },
        decoding: {
          format: 'json',
          encoding: 'utf-8',
        },
        parsing: {
          titlePattern: 'Clos(ing|ure) of Executive Departments',
          titlePatternNote:
            'local case-insensitive regex over the pulled EO list — server-side term search measurably misses; the pattern tolerates the three known title drifts (Providing for the Closing / Closing / Half-Day Closing)',
          referenceKeys: ['document_number', 'executive_order_number'],
          bodyRead:
            'on a title hit, read the document body for the date and full/half day; a half-day closing classifies as a working day with a provenance note (ADR-107 D-8)',
        },
        probeCadence: {
          defaultInterval: {
            days: 1,
          },
          segments: [
            {
              window: {
                startMonthDay: '12-01',
                endMonthDay: '12-31',
                note: 'EO high season (16 occurrences in 25 years, mostly December; minimum lead time 3 days, publication can trail effect) — daily is a pinned floor, never reduced',
              },
              interval: {
                days: 1,
              },
            },
          ],
        },
        licenseNote: 'US government work — public domain',
      },
    ],
    validation: {
      invariants: [
        {
          invariantId: 'us.statutory_holidays_present',
          severity: 'blocker',
          description:
            'All 11 statutory holidays appear (as observed dates) in every fully covered year',
          params: {
            expectedCount: 11,
          },
        },
        {
          invariantId: 'us.annual_observed_count_band',
          severity: 'warning',
          description:
            'Observed entries per calendar year within the measured 2021-2030 band (10-13; the float is real — per-year fetching would drop cross-year spillover, version accumulation is immune)',
          params: {
            min: 10,
            max: 13,
          },
        },
        {
          invariantId: 'us.annual_exception_days_band',
          severity: 'blocker',
          description:
            "Exception-fed closure days per calendar year within the measured 2001-2025 band. Exception days are exempt from every counting invariant and from the oracle diff (an ORACLE source structurally cannot carry an injected day), so this band is the only supervision they have — and the Federal Register feed's title regex is a deliberately wide local match, so unbounded injection is a live shape, not a hypothetical. Measured per-year maximum is 3 (2025: the Carter mourning day plus two December closings, cross-checked between the FR API enumeration and python-holidays' special_government_holidays table); 4 leaves one closure of headroom. BLOCKER rather than WARNING because a warning would restore visibility without restoring a constraint: rejection keeps the previously published version answering (coverage runs to the anchor + 4 years) and routes a genuinely unprecedented year through code review, while publication of an over-match is silent. SEED-PATH RESIDUE, permanent and by construction: a shipped pack admitted through the day-0 seed path always trips this band as a WARNING, and that is not a defect to chase. The seed path cannot be exception-aware — local validation takes no exception scope, and a pack carries no per-day source attribution to reconstruct one from (day overrides are a flat date-to-category map, with executive-order closure days already baked in). So the band, calibrated against what a TRUTH source routinely emits, is measured here against a total in which truth and exception days are already mixed. The warning is recorded rather than suppressed for one reason: suppressing it would be indistinguishable from suppressing a real over-match, and leaving it unexplained trains readers to ignore amber. ADR-107 section 14 owns this as a non-closable residue",
          params: {
            min: 0,
            max: 4,
          },
        },
      ],
      anchors: [
        {
          anchorId: 'us.christmas_observed',
          monthDay: '12-25',
          toleranceDays: 1,
          note: 'observed shift window: Sat→12-24, Sun→12-26',
          expectedCategory: 'holiday',
        },
        {
          anchorId: 'us.independence_day_observed',
          monthDay: '07-04',
          toleranceDays: 1,
          note: 'observed shift window: Sat→07-03, Sun→07-05',
          expectedCategory: 'holiday',
        },
      ],
      unsourcedOverlapDisposition: 'withheld',
      coverageShrinkDisposition: 'rejected',
      oracleDivergenceDisposition: 'withheld',
    },
    horizon: {
      warningFloorDays: 365,
      criticalFloorDays: 180,
      expectedExtensionWindow: null,
      note: "Coverage end is the policy-defined publication window (rules can compute arbitrarily far; computable ≠ exceptions known — the two-dimensional horizon's gap is structurally non-zero here), so these floors guard pipeline liveness, not an authority's publication rhythm; both numbers are policy choices, not dossier measurements. The OPM coverage end (2030-12-25) serves as the external horizon reference; the exception layer's horizon is structurally zero (ADR-107 HB-4: no probing frequency guarantees same-day knowledge of a same-day closure)",
      criticalComparison: 'inclusive',
    },
    semanticBoundary:
      "federal ≠ national — federal holidays do not mean nationwide closure (ADR-107 OQ-2 ruling, written into the contract face); state holidays are 50+ separate calendar identities outside the first batch. Operationally, this is also the one shipped calendar whose seed admission permanently carries a band WARNING (see the annual_exception_days_band invariant's own description): an amber line on this calendar at day-0 start-up is expected and load-bearing to leave visible, not a signal to act on",
  },
]
