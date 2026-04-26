# chat-rank-bench — 2026-04-25

**Repeat**: 3 · **Queries**: 12 · **Configs**: 6 · **Total**: 851s

## Verdict

- **Winner**: `max`
- **Promote**: ❌ NO
- **Reason**: best alt (w0.7-0.3) DCG -6.6% — under 5% improvement threshold (모든 alternative 가 max 대비 음수, 즉 max 가 winner)

## Summary by config

| config   | avg_dcg | total_dcg | avg_pool | jac_top5_vs_max | avg_latency_ms | zero_results |
|----------|---------|-----------|----------|-----------------|----------------|--------------|
| max      | 2.970   | 106.92    | 3.75     | 1.000           | 4333           | 3            |
| w0.5-0.5 | 2.679   | 96.43     | 3.75     | 0.919           | 4523           | 3            |
| w0.7-0.3 | 2.774   | 99.87     | 3.75     | 0.947           | 4467           | 3            |
| w0.3-0.7 | 2.732   | 98.36     | 3.75     | 0.947           | 4423           | 3            |
| vec      | 2.669   | 96.07     | 3.75     | 0.925           | 4872           | 3            |
| kw       | 0.250   | 9.00      | 0.08     | 0.100           | 165            | 33           |

## Per-query × config (raw)

#### Repeat 1/3

**proper-noun-illust** (vec=30, kw=1)
  - max       dcg=3.82 top=[661, 99619, 756, 811, 924]
  - w0.5-0.5  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.7-0.3  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.3-0.7  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - vec       dcg=3.00 top=[661, 99619, 756, 811, 924]
  - kw        dcg=3.00 top=[661]
**proper-noun-hangang-spring** (vec=30, kw=0)
  - max       dcg=1.77 top=[44354, 686, 630, 522, 636]
  - w0.5-0.5  dcg=2.77 top=[44354, 686, 630, 522, 636]
  - w0.7-0.3  dcg=2.89 top=[44354, 686, 630, 522, 636]
  - w0.3-0.7  dcg=2.89 top=[44354, 686, 630, 522, 636]
  - vec       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - kw        dcg=0.00 top=[(empty)]
**proper-noun-ddp-design** (vec=30, kw=0)
  - max       dcg=5.08 top=[1014, 1473, 906, 56906, 56890]
  - w0.5-0.5  dcg=6.08 top=[1014, 1473, 906, 56906, 56890]
  - w0.7-0.3  dcg=5.08 top=[1014, 1473, 906, 56906, 56890]
  - w0.3-0.7  dcg=4.58 top=[1014, 1473, 906, 56906, 56890]
  - vec       dcg=6.08 top=[1014, 1473, 906, 56906, 56890]
  - kw        dcg=0.00 top=[(empty)]
**generic-solo-calm** (vec=30, kw=0)
  - max       dcg=4.76 top=[44421, 1092, 795]
  - w0.5-0.5  dcg=5.26 top=[44421, 1092, 795]
  - w0.7-0.3  dcg=5.26 top=[44421, 1092, 795]
  - w0.3-0.7  dcg=4.76 top=[44421, 1092, 795]
  - vec       dcg=5.26 top=[44421, 1092, 795]
  - kw        dcg=0.00 top=[(empty)]
**generic-active-family** (vec=30, kw=0)
  - max       dcg=5.31 top=[910, 685, 883, 593, 912]
  - w0.5-0.5  dcg=5.05 top=[685, 910, 883, 593, 912]
  - w0.7-0.3  dcg=3.65 top=[685, 910, 883, 1010, 593]
  - w0.3-0.7  dcg=5.31 top=[685, 910, 883, 593, 912]
  - vec       dcg=4.02 top=[910, 685, 883, 593, 912]
  - kw        dcg=0.00 top=[(empty)]
**generic-couple-exhibition** (vec=30, kw=0)
  - max       dcg=6.78 top=[99631, 44421, 904, 44436, 1976]
  - w0.5-0.5  dcg=4.25 top=[44421, 99631, 44436, 1976, 1755]
  - w0.7-0.3  dcg=6.01 top=[99631, 44421, 904, 44436, 1976]
  - w0.3-0.7  dcg=5.35 top=[99631, 44421, 904, 44436, 1976]
  - vec       dcg=5.34 top=[99631, 44421, 904, 44436, 1976]
  - kw        dcg=0.00 top=[(empty)]
**region-date-gangnam-weekend** (vec=30, kw=0)
  - max       dcg=0.00 top=[(empty)]
  - w0.5-0.5  dcg=0.00 top=[(empty)]
  - w0.7-0.3  dcg=0.00 top=[(empty)]
  - w0.3-0.7  dcg=0.00 top=[(empty)]
  - vec       dcg=0.00 top=[(empty)]
  - kw        dcg=0.00 top=[(empty)]
**region-date-jongno-next-sunday** (vec=30, kw=0)
  - max       dcg=1.00 top=[904]
  - w0.5-0.5  dcg=1.00 top=[904]
  - w0.7-0.3  dcg=1.00 top=[904]
  - w0.3-0.7  dcg=1.00 top=[904]
  - vec       dcg=1.00 top=[904]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-narrow-outdoor** (vec=30, kw=0)
  - max       dcg=4.89 top=[791, 870, 1755, 1471, 1209]
  - w0.5-0.5  dcg=3.50 top=[791, 870, 1755, 1471, 824]
  - w0.7-0.3  dcg=4.06 top=[791, 870, 1755, 1471, 1209]
  - w0.3-0.7  dcg=3.00 top=[791, 870, 1755, 1471, 1209]
  - vec       dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-change-companion** (vec=30, kw=0)
  - max       dcg=2.95 top=[1108, 870, 44421, 62128, 902]
  - w0.5-0.5  dcg=2.02 top=[1108, 870, 62128, 44421, 791]
  - w0.7-0.3  dcg=4.01 top=[1108, 870, 44421, 62128, 902]
  - w0.3-0.7  dcg=2.95 top=[1108, 870, 44421, 62128, 902]
  - vec       dcg=1.50 top=[1108, 870, 62128, 44421, 902]
  - kw        dcg=0.00 top=[(empty)]
**edge-trivial-short** (vec=13, kw=0)
  - max       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.5-0.5  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.7-0.3  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.3-0.7  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - vec       dcg=0.77 top=[44306, 44320, 518, 532, 870]
  - kw        dcg=0.00 top=[(empty)]
**edge-no-match** (vec=30, kw=0)
  - max       dcg=0.00 top=[522]
  - w0.5-0.5  dcg=0.00 top=[522]
  - w0.7-0.3  dcg=0.00 top=[522]
  - w0.3-0.7  dcg=0.00 top=[522]
  - vec       dcg=0.00 top=[522]
  - kw        dcg=0.00 top=[(empty)]

#### Repeat 2/3

**proper-noun-illust** (vec=30, kw=1)
  - max       dcg=3.00 top=[661, 99619, 811, 924, 44360]
  - w0.5-0.5  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.7-0.3  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.3-0.7  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - vec       dcg=3.00 top=[661, 99619, 756, 44360, 44293]
  - kw        dcg=3.00 top=[661]
**proper-noun-hangang-spring** (vec=30, kw=0)
  - max       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - w0.5-0.5  dcg=1.27 top=[44354, 686, 630, 522, 636]
  - w0.7-0.3  dcg=2.89 top=[44354, 686, 630, 522, 636]
  - w0.3-0.7  dcg=4.77 top=[44354, 686, 630, 522, 636]
  - vec       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - kw        dcg=0.00 top=[(empty)]
**proper-noun-ddp-design** (vec=30, kw=0)
  - max       dcg=4.02 top=[1014, 1473, 906, 56906, 56890]
  - w0.5-0.5  dcg=5.58 top=[1014, 1473, 906, 56906, 56890]
  - w0.7-0.3  dcg=2.63 top=[1014, 1473, 906, 56906, 56890]
  - w0.3-0.7  dcg=2.13 top=[1014, 1473, 906, 56906, 56890]
  - vec       dcg=5.08 top=[1014, 1473, 906, 56906, 56890]
  - kw        dcg=0.00 top=[(empty)]
**generic-solo-calm** (vec=30, kw=0)
  - max       dcg=4.76 top=[44421, 1092, 795]
  - w0.5-0.5  dcg=5.26 top=[44421, 1092, 795]
  - w0.7-0.3  dcg=5.26 top=[44421, 1092, 795]
  - w0.3-0.7  dcg=4.76 top=[44421, 1092, 795]
  - vec       dcg=4.76 top=[44421, 1092, 795]
  - kw        dcg=0.00 top=[(empty)]
**generic-active-family** (vec=30, kw=0)
  - max       dcg=3.65 top=[685, 910, 883, 593, 912]
  - w0.5-0.5  dcg=4.32 top=[685, 910, 883, 593, 912]
  - w0.7-0.3  dcg=4.28 top=[685, 910, 883, 1010, 593]
  - w0.3-0.7  dcg=4.38 top=[910, 685, 883, 593, 912]
  - vec       dcg=5.44 top=[910, 685, 883, 593, 912]
  - kw        dcg=0.00 top=[(empty)]
**generic-couple-exhibition** (vec=30, kw=0)
  - max       dcg=5.35 top=[99631, 44421, 904, 44436, 1976]
  - w0.5-0.5  dcg=4.64 top=[44421, 99631, 44436, 1976, 1755]
  - w0.7-0.3  dcg=5.08 top=[99631, 44421, 904, 44436, 1976]
  - w0.3-0.7  dcg=5.44 top=[44436, 1976, 99631, 44421, 904]
  - vec       dcg=5.19 top=[99631, 44421, 904, 44436, 1976]
  - kw        dcg=0.00 top=[(empty)]
**region-date-gangnam-weekend** (vec=30, kw=0)
  - max       dcg=0.00 top=[(empty)]
  - w0.5-0.5  dcg=0.00 top=[(empty)]
  - w0.7-0.3  dcg=0.00 top=[(empty)]
  - w0.3-0.7  dcg=0.00 top=[(empty)]
  - vec       dcg=0.00 top=[(empty)]
  - kw        dcg=0.00 top=[(empty)]
**region-date-jongno-next-sunday** (vec=30, kw=0)
  - max       dcg=1.00 top=[904]
  - w0.5-0.5  dcg=1.00 top=[904]
  - w0.7-0.3  dcg=1.00 top=[904]
  - w0.3-0.7  dcg=1.00 top=[904]
  - vec       dcg=1.00 top=[904]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-narrow-outdoor** (vec=30, kw=0)
  - max       dcg=3.89 top=[791, 870, 1755, 1357, 1126]
  - w0.5-0.5  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - w0.7-0.3  dcg=3.00 top=[791, 870, 1755, 1471, 1209]
  - w0.3-0.7  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - vec       dcg=3.50 top=[791, 870, 1755, 1471, 1209]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-change-companion** (vec=30, kw=0)
  - max       dcg=3.69 top=[1108, 870, 62128, 44421, 902]
  - w0.5-0.5  dcg=2.99 top=[1108, 870, 44421, 62128, 902]
  - w0.7-0.3  dcg=2.99 top=[1108, 870, 62128, 44421, 902]
  - w0.3-0.7  dcg=2.95 top=[1108, 870, 44421, 62128, 791]
  - vec       dcg=3.06 top=[1108, 870, 62128, 44421, 902]
  - kw        dcg=0.00 top=[(empty)]
**edge-trivial-short** (vec=13, kw=0)
  - max       dcg=0.77 top=[44306, 44320, 518, 532, 870]
  - w0.5-0.5  dcg=0.77 top=[44306, 44320, 518, 532, 870]
  - w0.7-0.3  dcg=0.77 top=[44306, 44320, 518, 532, 870]
  - w0.3-0.7  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - vec       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - kw        dcg=0.00 top=[(empty)]
**edge-no-match** (vec=30, kw=0)
  - max       dcg=0.00 top=[522]
  - w0.5-0.5  dcg=0.00 top=[522]
  - w0.7-0.3  dcg=0.00 top=[522]
  - w0.3-0.7  dcg=0.00 top=[522]
  - vec       dcg=0.00 top=[522]
  - kw        dcg=0.00 top=[(empty)]

#### Repeat 3/3

**proper-noun-illust** (vec=30, kw=1)
  - max       dcg=3.43 top=[661, 99619, 756, 811, 924]
  - w0.5-0.5  dcg=3.00 top=[661, 99619, 811, 924, 44360]
  - w0.7-0.3  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - w0.3-0.7  dcg=3.00 top=[661, 99619, 756, 811, 924]
  - vec       dcg=3.00 top=[661, 99619, 756, 44360, 44293]
  - kw        dcg=3.00 top=[661]
**proper-noun-hangang-spring** (vec=30, kw=0)
  - max       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - w0.5-0.5  dcg=2.89 top=[44354, 686, 630, 522, 636]
  - w0.7-0.3  dcg=2.16 top=[44354, 686, 630, 522, 636]
  - w0.3-0.7  dcg=2.89 top=[44354, 686, 630, 522, 636]
  - vec       dcg=2.89 top=[44354, 686, 630, 522, 636]
  - kw        dcg=0.00 top=[(empty)]
**proper-noun-ddp-design** (vec=30, kw=0)
  - max       dcg=5.08 top=[1014, 1473, 906, 56906, 56890]
  - w0.5-0.5  dcg=3.13 top=[1014, 1473, 906, 56906, 56890]
  - w0.7-0.3  dcg=5.08 top=[1014, 1473, 906, 56906, 56890]
  - w0.3-0.7  dcg=3.13 top=[1014, 1473, 906, 56906, 56890]
  - vec       dcg=4.47 top=[1014, 1473, 56906, 56890, 906]
  - kw        dcg=0.00 top=[(empty)]
**generic-solo-calm** (vec=30, kw=0)
  - max       dcg=5.76 top=[44421, 1092, 795]
  - w0.5-0.5  dcg=4.76 top=[44421, 1092, 795]
  - w0.7-0.3  dcg=4.76 top=[44421, 1092, 795]
  - w0.3-0.7  dcg=4.76 top=[44421, 1092, 795]
  - vec       dcg=4.76 top=[44421, 1092, 795]
  - kw        dcg=0.00 top=[(empty)]
**generic-active-family** (vec=30, kw=0)
  - max       dcg=4.88 top=[910, 685, 883, 593, 912]
  - w0.5-0.5  dcg=4.32 top=[685, 910, 883, 593, 912]
  - w0.7-0.3  dcg=5.14 top=[685, 910, 883, 593, 912]
  - w0.3-0.7  dcg=5.01 top=[685, 910, 883, 593, 912]
  - vec       dcg=4.15 top=[685, 910, 883, 593, 912]
  - kw        dcg=0.00 top=[(empty)]
**generic-couple-exhibition** (vec=30, kw=0)
  - max       dcg=5.97 top=[99631, 44421, 904, 44436, 1976]
  - w0.5-0.5  dcg=5.97 top=[99631, 44421, 904, 44436, 1976]
  - w0.7-0.3  dcg=5.08 top=[99631, 44421, 904, 44436, 1976]
  - w0.3-0.7  dcg=5.97 top=[99631, 44421, 904, 44436, 1976]
  - vec       dcg=5.03 top=[44421, 99631, 44436, 1976, 1617]
  - kw        dcg=0.00 top=[(empty)]
**region-date-gangnam-weekend** (vec=30, kw=0)
  - max       dcg=0.00 top=[(empty)]
  - w0.5-0.5  dcg=0.00 top=[(empty)]
  - w0.7-0.3  dcg=0.00 top=[(empty)]
  - w0.3-0.7  dcg=0.00 top=[(empty)]
  - vec       dcg=0.00 top=[(empty)]
  - kw        dcg=0.00 top=[(empty)]
**region-date-jongno-next-sunday** (vec=30, kw=0)
  - max       dcg=1.00 top=[904]
  - w0.5-0.5  dcg=1.00 top=[904]
  - w0.7-0.3  dcg=1.00 top=[904]
  - w0.3-0.7  dcg=1.00 top=[904]
  - vec       dcg=1.00 top=[904]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-narrow-outdoor** (vec=30, kw=0)
  - max       dcg=5.58 top=[791, 870, 1755, 1471, 1209]
  - w0.5-0.5  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - w0.7-0.3  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - w0.3-0.7  dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - vec       dcg=3.00 top=[791, 870, 1755, 1471, 824]
  - kw        dcg=0.00 top=[(empty)]
**multi-turn-change-companion** (vec=30, kw=0)
  - max       dcg=2.95 top=[1108, 870, 62128, 44421, 902]
  - w0.5-0.5  dcg=3.58 top=[1108, 870, 44421, 62128, 902]
  - w0.7-0.3  dcg=4.01 top=[1108, 870, 62128, 44421, 902]
  - w0.3-0.7  dcg=5.33 top=[1108, 870, 44421, 62128, 791]
  - vec       dcg=1.00 top=[1108, 870, 62128, 44421, 902]
  - kw        dcg=0.00 top=[(empty)]
**edge-trivial-short** (vec=13, kw=0)
  - max       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.5-0.5  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - w0.7-0.3  dcg=0.77 top=[44306, 44320, 518, 532, 870]
  - w0.3-0.7  dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - vec       dcg=0.00 top=[44306, 44320, 518, 532, 870]
  - kw        dcg=0.00 top=[(empty)]
**edge-no-match** (vec=30, kw=0)
  - max       dcg=0.00 top=[522]
  - w0.5-0.5  dcg=0.00 top=[522]
  - w0.7-0.3  dcg=0.00 top=[522]
  - w0.3-0.7  dcg=0.00 top=[522]
  - vec       dcg=0.00 top=[522]
  - kw        dcg=0.00 top=[(empty)]

## Method

- **Hit fetch**: query 당 1회 (vector via Qdrant `/events/search` 0.25 threshold, keyword via pg_trgm `<<%` 0.30 threshold). 6 config 가 동일 hit pool 재사용.
- **Combiner**: `combineHits()` (chat.ts) — `max | weighted(α,β) | vec | kw`.
- **Resolve + rerank**: `resolveAndRank()` — Prisma phase/period filter + LLM `/events/rerank` (≥6 candidates and query ≥8 chars).
- **Judge**: LLM `/judge/relevance` — gpt-4o-mini graded 0~3 with shuffled candidate order to remove position bias.
- **DCG**: Σ rel_i / log₂(rank_i + 1) over final top-5.
- **Decision rule**: promote iff `avg_dcg[best] ≥ avg_dcg[max] × 1.05` AND `jac_top5_vs_max[best] ≥ 0.85`.
