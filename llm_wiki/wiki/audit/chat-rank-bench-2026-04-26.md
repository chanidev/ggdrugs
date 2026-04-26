# chat-rank-bench — 2026-04-26

**Repeat**: 1 · **Queries**: 12 · **Configs**: 6 · **Total**: 360s

## Verdict

- **Winner**: `max`
- **Promote**: ❌ NO
- **Reason**: best alt (vec) DCG +1.9% — under 5% threshold

## Summary by config

| config   | avg_dcg | total_dcg | avg_pool | jac_top5_vs_max | avg_latency_ms | zero_results |
|----------|---------|-----------|----------|-----------------|----------------|--------------|
| max      | 2.805   | 33.66     | 4.83     | 1.000           | 5027           | 0            |
| w0.5-0.5 | 2.570   | 30.84     | 4.83     | 0.746           | 5133           | 0            |
| w0.7-0.3 | 2.734   | 32.81     | 4.83     | 0.715           | 5198           | 0            |
| w0.3-0.7 | 2.446   | 29.36     | 4.83     | 0.746           | 5346           | 0            |
| vec      | 2.857   | 34.29     | 3.75     | 0.240           | 3995           | 1            |
| kw       | 2.422   | 29.07     | 3.92     | 0.686           | 4395           | 2            |

## Per-query × config (raw)

#### Repeat 1/1

**proper-noun-illust** (vec=30, kw=30)
  - max       dcg=0.00 top=[516, 517, 531, 543, 533]
  - w0.5-0.5  dcg=0.63 top=[539, 531, 537, 533, 516]
  - w0.7-0.3  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.3-0.7  dcg=0.00 top=[539, 531, 537, 533, 516]
  - vec       dcg=3.00 top=[661, 99619, 756, 811, 924]
  - kw        dcg=0.50 top=[516, 537, 531, 543, 523]
**proper-noun-hangang-spring** (vec=30, kw=21)
  - max       dcg=4.63 top=[794, 44360, 44354, 698, 931]
  - w0.5-0.5  dcg=4.56 top=[794, 698, 44360, 44354, 522]
  - w0.7-0.3  dcg=4.55 top=[686, 630, 636, 794, 44354]
  - w0.3-0.7  dcg=5.58 top=[794, 698, 44360, 3714, 1000]
  - vec       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - kw        dcg=4.63 top=[794, 44360, 44354, 698, 931]
**proper-noun-ddp-design** (vec=30, kw=9)
  - max       dcg=4.85 top=[1473, 1014, 906, 1436, 626]
  - w0.5-0.5  dcg=4.15 top=[1014, 1473, 906, 56890, 626]
  - w0.7-0.3  dcg=3.02 top=[1014, 1473, 906, 56890, 1436]
  - w0.3-0.7  dcg=5.01 top=[1014, 1473, 906, 1436, 56906]
  - vec       dcg=4.58 top=[1014, 1473, 906, 56906, 56890]
  - kw        dcg=2.56 top=[1473, 1014, 906, 1436, 56890]
**generic-solo-calm** (vec=30, kw=12)
  - max       dcg=6.83 top=[4383, 865, 794, 795, 44392]
  - w0.5-0.5  dcg=7.10 top=[795, 4383, 865, 794, 44392]
  - w0.7-0.3  dcg=7.10 top=[795, 4383, 865, 794, 44392]
  - w0.3-0.7  dcg=5.58 top=[795, 4383, 865, 794, 44392]
  - vec       dcg=4.76 top=[44421, 1092, 795]
  - kw        dcg=5.20 top=[4383, 865, 794, 795, 44392]
**generic-active-family** (vec=30, kw=13)
  - max       dcg=3.18 top=[1123, 664, 768, 657, 653]
  - w0.5-0.5  dcg=3.58 top=[1123, 768, 657, 668, 44320]
  - w0.7-0.3  dcg=3.81 top=[1123, 664, 768, 657, 653]
  - w0.3-0.7  dcg=4.34 top=[1123, 768, 657, 668, 44334]
  - vec       dcg=4.94 top=[685, 593, 910, 883, 1010]
  - kw        dcg=3.95 top=[1123, 664, 657, 768, 668]
**generic-couple-exhibition** (vec=30, kw=30)
  - max       dcg=5.84 top=[851, 823, 885, 825, 707]
  - w0.5-0.5  dcg=2.16 top=[851, 823, 885, 1010, 707]
  - w0.7-0.3  dcg=4.52 top=[851, 823, 885, 1010, 707]
  - w0.3-0.7  dcg=2.06 top=[851, 823, 885, 1010, 825]
  - vec       dcg=5.97 top=[99631, 44421, 904, 44436, 1976]
  - kw        dcg=5.15 top=[851, 823, 885, 825, 707]
**region-date-gangnam-weekend** (vec=30, kw=30)
  - max       dcg=1.00 top=[667, 589, 599]
  - w0.5-0.5  dcg=0.00 top=[667, 589, 599]
  - w0.7-0.3  dcg=0.00 top=[667, 589, 599]
  - w0.3-0.7  dcg=0.63 top=[667, 589, 599]
  - vec       dcg=0.00 top=[(empty)]
  - kw        dcg=1.13 top=[667, 589, 599]
**region-date-jongno-next-sunday** (vec=30, kw=15)
  - max       dcg=2.39 top=[1123, 668, 768, 756, 904]
  - w0.5-0.5  dcg=1.77 top=[1123, 668, 768, 756, 904]
  - w0.7-0.3  dcg=0.86 top=[1123, 668, 768, 904, 756]
  - w0.3-0.7  dcg=3.16 top=[1123, 668, 768, 756, 904]
  - vec       dcg=1.00 top=[904]
  - kw        dcg=3.00 top=[1123, 668, 768, 756]
**multi-turn-narrow-outdoor** (vec=30, kw=0)
  - max       dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - w0.5-0.5  dcg=3.93 top=[791, 870, 1755, 1471, 824]
  - w0.7-0.3  dcg=3.00 top=[791, 870, 1755, 1471, 1209]
  - w0.3-0.7  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - vec       dcg=5.84 top=[791, 870, 1755, 1471, 824]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-change-companion** (vec=30, kw=30)
  - max       dcg=1.95 top=[686, 694, 652, 769, 700]
  - w0.5-0.5  dcg=2.95 top=[694, 686, 652, 769, 759]
  - w0.7-0.3  dcg=2.95 top=[694, 686, 652, 769, 696]
  - w0.3-0.7  dcg=0.00 top=[694, 686, 652, 769, 696]
  - vec       dcg=1.32 top=[1108, 870, 44421, 62128, 791]
  - kw        dcg=2.95 top=[686, 694, 652, 769, 696]
**edge-trivial-short** (vec=13, kw=0)
  - max       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.5-0.5  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.7-0.3  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.3-0.7  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - vec       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - kw        dcg=0.00 top=[(empty)]
**edge-no-match** (vec=30, kw=30)
  - max       dcg=0.00 top=[623, 686, 698, 664, 621]
  - w0.5-0.5  dcg=0.00 top=[698, 686, 623, 739, 601]
  - w0.7-0.3  dcg=0.00 top=[698, 686, 623, 739, 621]
  - w0.3-0.7  dcg=0.00 top=[698, 686, 623, 739, 621]
  - vec       dcg=0.00 top=[522]
  - kw        dcg=0.00 top=[623, 686, 698, 664, 621]

## Method

- **Hit fetch**: query 당 1회 (vector via Qdrant `/events/search` 0.25 threshold, keyword via pg_trgm `<<%` 0.30 threshold). 6 config 가 동일 hit pool 재사용.
- **Combiner**: `combineHits()` (chat.ts) — `max | weighted(α,β) | vec | kw`.
- **Resolve + rerank**: `resolveAndRank()` — Prisma phase/period filter + LLM `/events/rerank` (≥6 candidates and query ≥8 chars).
- **Judge**: LLM `/judge/relevance` — gpt-4o-mini graded 0~3 with shuffled candidate order to remove position bias.
- **DCG**: Σ rel_i / log₂(rank_i + 1) over final top-5.
- **Decision rule**: promote iff `avg_dcg[best] ≥ avg_dcg[max] × 1.05` AND `jac_top5_vs_max[best] ≥ 0.85`.
