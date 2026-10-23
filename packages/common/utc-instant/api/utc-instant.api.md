# @omne-harness/utc-instant 的 API 快照

<!-- omne-contract-api 快照格式 1 -->

> 由 `omne-contract-api --write` 从 dist 的声明生成，不要手改。

## 入口 `.` · `index.d.ts`

- `Duration` 仅类型 · `duration.d.ts`
- `DurationFailure` · `duration.d.ts`
- `DurationParse` · `duration.d.ts`
- `Instant` 仅类型 · `instant.d.ts`
- `InstantFailure` · `instant.d.ts`
- `InstantParse` · `instant.d.ts`
- `LeapSecondData` 仅类型 · `instant.d.ts`
- `LeapSecondDataRead` · `instant.d.ts`
- `compareInstants` · `instant.d.ts`
- `encodeDuration` · `duration.d.ts`
- `encodeInstant` · `instant.d.ts`
- `leapSecondData` · `instant.d.ts`
- `parseDuration` · `duration.d.ts`
- `parseInstant` · `instant.d.ts`
- `readLeapSecondData` · `instant.d.ts`

## 声明文件 `duration.d.ts`

```ts
declare class Duration {
    #private;
    constructor(mint: symbol, text: string);
    toJSON(): never;
    toString(): never;
}
export type { Duration };
export type DurationFailure = {
    readonly kind: 'syntax' | 'calendar-unit';
};
export type DurationParse = {
    readonly ok: true;
    readonly value: Duration;
} | {
    readonly ok: false;
    readonly failure: DurationFailure;
};
export declare function parseDuration(text: string): DurationParse;
export declare function encodeDuration(duration: Duration): string;
```

## 声明文件 `index.d.ts`

```ts
export { encodeDuration, parseDuration } from './duration.ts';
export type { Duration, DurationFailure, DurationParse } from './duration.ts';
export { compareInstants, encodeInstant, leapSecondData, parseInstant, readLeapSecondData, } from './instant.ts';
export type { Instant, InstantFailure, InstantParse, LeapSecondData, LeapSecondDataRead, } from './instant.ts';
```

## 声明文件 `instant.d.ts`

```ts
import { type LeapSecondsListFailure } from './leap-seconds.ts';
declare class Instant {
    #private;
    constructor(mint: symbol, civil: string, fraction: string);
    toJSON(): never;
    toString(): never;
}
declare class LeapSecondData {
    #private;
    constructor(mint: symbol, source: string, version: Instant, expires: Instant, insertions: readonly string[], deletions: readonly string[]);
    get source(): string;
    get version(): Instant;
    get expires(): Instant;
    toJSON(): never;
    toString(): never;
}
export type { Instant, LeapSecondData };
export type LeapSecondDataRead = {
    readonly ok: true;
    readonly value: LeapSecondData;
} | {
    readonly ok: false;
    readonly failure: LeapSecondsListFailure;
};
export declare function readLeapSecondData(text: string, source: string): LeapSecondDataRead;
export declare const leapSecondData: LeapSecondData;
export type InstantFailure = {
    readonly kind: 'syntax' | 'offset' | 'range' | 'leap-data-expired';
} | {
    readonly kind: 'leap-second';
    readonly detail: 'not-inserted' | 'deleted';
};
export type InstantParse = {
    readonly ok: true;
    readonly value: Instant;
} | {
    readonly ok: false;
    readonly failure: InstantFailure;
};
export declare function parseInstant(text: string, table?: LeapSecondData): InstantParse;
export declare function encodeInstant(instant: Instant): string;
export declare function compareInstants(a: Instant, b: Instant): -1 | 0 | 1;
```

## 声明文件 `leap-seconds.d.ts`

```ts
export type LeapSecondsList = {
    readonly version: string;
    readonly expires: string;
    readonly insertions: readonly string[];
    readonly deletions: readonly string[];
};
export type LeapSecondsListFailure = {
    readonly kind: 'syntax' | 'step';
};
export type LeapSecondsListRead = {
    readonly ok: true;
    readonly value: LeapSecondsList;
} | {
    readonly ok: false;
    readonly failure: LeapSecondsListFailure;
};
export declare function readLeapSecondsList(text: string): LeapSecondsListRead;
export declare function decimal(digits: string): number;
```

## 声明文件 `leap-seconds.generated.d.ts`

```ts
export declare const leapSecondsListText = "#\tATOMIC TIME\n#\tCoordinated Universal Time (UTC) is the reference time scale derived\n#\tfrom The \"Temps Atomique International\" (TAI) calculated by the Bureau\n#\tInternational des Poids et Mesures (BIPM) using a worldwide network of atomic\n#\tclocks. UTC differs from TAI by an integer number of seconds; it is the basis\n#\tof all activities in the world.\n#\n#\n#\tASTRONOMICAL TIME (UT1) is the time scale based on the rate of rotation of the earth.\n#\tIt is now mainly derived from Very Long Baseline Interferometry (VLBI). The various\n#\tirregular fluctuations progressively detected in the rotation rate of the Earth led\n#\tin 1972 to the replacement of UT1 by UTC as the reference time scale.\n#\n#\n#\tLEAP SECOND\n#\tAtomic clocks are more stable than the rate of the earth's rotation since the latter\n#\tundergoes a full range of geophysical perturbations at various time scales: lunisolar\n#\tand core-mantle torques, atmospheric and oceanic effects, etc.\n#\tLeap seconds are needed to keep the two time scales in agreement, i.e. UT1-UTC smaller\n#\tthan 0.9 seconds. Therefore, when necessary a \"leap second\" is applied to UTC.\n#\tSince the adoption of this system in 1972 it has been necessary to add a number of seconds to UTC,\n#\tfirstly due to the initial choice of the value of the second (1/86400 mean solar day of\n#\tthe year 1820) and secondly to the general slowing down of the Earth's rotation. It is\n#\ttheoretically possible to have a negative leap second (a second removed from UTC), but so far,\n#\tall leap seconds have been positive (a second has been added to UTC). Based on what we know about\n#\tthe earth's rotation, it is unlikely that we will ever have a negative leap second.\n#\n#\n#\tHISTORY\n#\tThe first leap second was added on June 30, 1972. Until the year 2000, it was necessary in average to add a\n#       leap second at a rate of 1 to 2 years. Since the year 2000 leap seconds are introduced with an\n#\taverage interval of 3 to 4 years due to the acceleration of the Earth's rotation speed.\n#\n#\n#\tRESPONSIBILITY OF THE DECISION TO INTRODUCE A LEAP SECOND IN UTC\n#\tThe decision to introduce a leap second in UTC is the responsibility of the Earth Orientation Center of\n#\tthe International Earth Rotation and reference System Service (IERS). This center is located at Paris\n#\tObservatory. According to international agreements, leap seconds should be scheduled only for certain dates:\n#\tfirst preference is given to the end of December and June, and second preference at the end of March\n#\tand September. Since the introduction of leap seconds in 1972, only dates in June and December were used.\n#\n#\t\tQuestions or comments to:\n#\t\t\tChristian Bizouard:  christian.bizouard@obspm.fr\n#\t\t\tEarth orientation Center of the IERS\n#\t\t\tParis Observatory, France\n#\n#\n#\n#    \tCOPYRIGHT STATUS OF THIS FILE\n#    \tThis file is in the public domain.\n#\n#\n#\tVALIDITY OF THE FILE\n#\tIt is important to express the validity of the file. These next two dates are\n#\tgiven in units of seconds since 1900.0.\n#\n#\t1) Last update of the file.\n#\n#\tUpdated through IERS Bulletin C (https://hpiers.obspm.fr/iers/bul/bulc/bulletinc.dat)\n#\n#\tThe following line shows the last update of this file in NTP timestamp:\n#\n#$\t3992312697\n#\n#\t2) Expiration date of the file given on a semi-annual basis: last June or last December\n#\n#\tFile expires on 28 June 2027\n#\n#\tExpire date in NTP timestamp:\n#\n#@\t4023129600\n#\n#\n#\tLIST OF LEAP SECONDS\n#\tNTP timestamp (X parameter) is the number of seconds since 1900.0\n#\n#\tMJD: The Modified Julian Day number. MJD = X/86400 + 15020\n#\n#\tDTAI: The difference DTAI= TAI-UTC in units of seconds\n#\tIt is the quantity to add to UTC to get the time in TAI\n#\n#\tDay Month Year : epoch in clear\n#\n#NTP Time      DTAI    Day Month Year\n#\n2272060800      10      # 1 Jan 1972\n2287785600      11      # 1 Jul 1972\n2303683200      12      # 1 Jan 1973\n2335219200      13      # 1 Jan 1974\n2366755200      14      # 1 Jan 1975\n2398291200      15      # 1 Jan 1976\n2429913600      16      # 1 Jan 1977\n2461449600      17      # 1 Jan 1978\n2492985600      18      # 1 Jan 1979\n2524521600      19      # 1 Jan 1980\n2571782400      20      # 1 Jul 1981\n2603318400      21      # 1 Jul 1982\n2634854400      22      # 1 Jul 1983\n2698012800      23      # 1 Jul 1985\n2776982400      24      # 1 Jan 1988\n2840140800      25      # 1 Jan 1990\n2871676800      26      # 1 Jan 1991\n2918937600      27      # 1 Jul 1992\n2950473600      28      # 1 Jul 1993\n2982009600      29      # 1 Jul 1994\n3029443200      30      # 1 Jan 1996\n3076704000      31      # 1 Jul 1997\n3124137600      32      # 1 Jan 1999\n3345062400      33      # 1 Jan 2006\n3439756800      34      # 1 Jan 2009\n3550089600      35      # 1 Jul 2012\n3644697600      36      # 1 Jul 2015\n3692217600      37      # 1 Jan 2017\n#\n#\tA hash code has been generated to be able to verify the integrity\n#\tof this file. For more information about using this hash code,\n#\tplease see the readme file in the 'source' directory :\n#\thttps://hpiers.obspm.fr/iers/bul/bulc/ntp/sources/README\n#\n#h\ta9bad145 84c31c70 758402aa b37bfd54 5923836a\n";
```
