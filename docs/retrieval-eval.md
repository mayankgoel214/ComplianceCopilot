# Retrieval evaluation

Every number on this page is produced by `npx tsx --env-file=.env.local eval/run-eval.mts` against the committed index and the committed gold set. Nothing is typed in by hand.

## Setup

- **Corpus** — 413 sections of regulation text across 6 frameworks, chunked into 1147 passages at a 320-token target with 64 tokens of overlap. Sources are US federal regulations (public domain) and the GDPR; see `scripts/fetch-corpus.mjs`.
- **Embeddings** — `gemini-embedding-001` at 768 dimensions, asymmetric task types (`RETRIEVAL_DOCUMENT` for passages, `RETRIEVAL_QUERY` for queries).
- **Gold set** — 118 queries carrying 155 labelled sections, in `eval/gold-set.jsonl`. Written by the author after reading the corpus; every label was checked against the section text.
- **Split** — **dev 76** `direct` queries, phrased close to the regulation's own language; **test 32** `paraphrased` queries, written as a practitioner would describe the situation and deliberately avoiding the target section's vocabulary. The fusion weight is the only fitted parameter in the stack and it is chosen on dev alone. Everything else — BM25's k1 and b, RRF's k, the chunk size — is a published default or was fixed before the gold set existed.
- **Relevance** — judged at section granularity. A retrieved chunk hits a label if it came from that section; rankings are deduplicated by section before scoring.
- **Latency** — query embeddings are cached across configurations so that one query costs one embedding rather than one per row, which means the reported latencies are search time and exclude the embedding round trip. In the live application that round trip is roughly 200-350 ms and is charged once per query, whichever configuration runs.

## Held-out test slice

The 32 paraphrased queries. These are the numbers that mean something.

| Configuration | R@1 | R@3 | R@5 | R@10 | MRR@10 | nDCG@10 | Median | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BM25 | 7.8% | 15.6% | 21.9% | 28.1% | 0.172 | 0.178 | 0 ms | 1 ms |
| Dense | 38.5% | 56.8% | 72.4% | 84.4% | 0.651 | 0.666 | 1 ms | 1 ms |
| Dense (int8) | 38.5% | 56.8% | 70.8% | 84.4% | 0.657 | 0.665 | 1 ms | 1 ms |
| Hybrid RRF (equal) | 17.2% | 30.7% | 43.2% | 55.7% | 0.377 | 0.383 | 1 ms | 1 ms |
| Hybrid RRF (weighted) | 38.5% | 56.8% | 72.4% | 84.4% | 0.651 | 0.666 | 1 ms | 1 ms |
| Hybrid + rerank | 43.2% | 79.7% | 87.5% | 90.6% | 0.741 | 0.776 | 11562 ms | 15284 ms |

Best by nDCG@10 on the held-out slice: **Hybrid + rerank** (0.776).

## Development slice

The 76 direct queries. The fusion weight was chosen here, so treat these as a description of the slice rather than as an independent result.

| Configuration | R@1 | R@3 | R@5 | R@10 | MRR@10 | nDCG@10 | Median | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BM25 | 42.1% | 58.1% | 64.7% | 78.9% | 0.558 | 0.605 | 0 ms | 1 ms |
| Dense | 84.6% | 96.1% | 97.8% | 99.3% | 0.948 | 0.952 | 1 ms | 1 ms |
| Dense (int8) | 84.6% | 94.7% | 97.8% | 99.3% | 0.948 | 0.951 | 1 ms | 1 ms |
| Hybrid RRF (equal) | 65.1% | 87.7% | 95.6% | 98.9% | 0.812 | 0.852 | 1 ms | 1 ms |
| Hybrid RRF (weighted) | 84.6% | 96.1% | 97.8% | 99.3% | 0.948 | 0.952 | 1 ms | 1 ms |
| Hybrid + rerank | 87.7% | 98.0% | 98.9% | 100.0% | 0.974 | 0.976 | 10575 ms | 14082 ms |

## Citation-lookup slice

10 queries that name a section directly — `45 CFR 164.312`, `GDPR Article 30`, `734.4 de minimis`. This slice exists because the headline result below is that fusion does not help, and that conclusion is only honest if the query class where the lexical arm is indispensable is also on the page. A dense retriever has no special handle on a section number; BM25 does.

| Configuration | R@1 | R@3 | R@5 | R@10 | MRR@10 | nDCG@10 | Median | p95 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BM25 | 70.0% | 80.0% | 80.0% | 90.0% | 0.767 | 0.799 | 0 ms | 1 ms |
| Dense | 80.0% | 80.0% | 90.0% | 100.0% | 0.837 | 0.874 | 1 ms | 1 ms |
| Dense (int8) | 80.0% | 80.0% | 90.0% | 100.0% | 0.834 | 0.872 | 1 ms | 1 ms |
| Hybrid RRF (equal) | 90.0% | 100.0% | 100.0% | 100.0% | 0.933 | 0.950 | 1 ms | 1 ms |
| Hybrid RRF (weighted) | 80.0% | 80.0% | 90.0% | 100.0% | 0.837 | 0.874 | 1 ms | 1 ms |
| Hybrid + rerank | 100.0% | 100.0% | 100.0% | 100.0% | 1.000 | 1.000 | 8929 ms | 14325 ms |

## Choosing the fusion weight

Equal-weight RRF is the textbook default and it is the wrong default here: BM25 is much the weaker arm on this corpus, and giving it an equal vote pulls the fused ranking below dense retrieval alone. The lexical weight was swept on the dev slice:

| Lexical weight | Dev nDCG@10 |
| --- | --- |
| 0.00 **(chosen)** | 0.9523 |
| 0.10 | 0.9462 |
| 0.20 | 0.9283 |
| 0.30 | 0.9197 |
| 0.50 | 0.8882 |
| 0.75 | 0.8647 |
| 1.00 | 0.8516 |

A lexical weight of 0 is dense retrieval with extra steps, and is included so that the sweep can say so if that is what the data shows.

## Recall@10 by framework, held-out slice

| Framework | n | BM25 | Dense | Dense (int8) | Hybrid RRF (equal) | Hybrid RRF (weighted) | Hybrid + rerank |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADA/Section 508 | 3 | 0.0% | 50.0% | 50.0% | 33.3% | 50.0% | 83.3% |
| Export Controls (EAR/ITAR) | 5 | 60.0% | 90.0% | 90.0% | 60.0% | 90.0% | 90.0% |
| FERPA | 5 | 30.0% | 100.0% | 100.0% | 70.0% | 100.0% | 100.0% |
| GDPR | 7 | 0.0% | 71.4% | 71.4% | 50.0% | 71.4% | 85.7% |
| HIPAA | 6 | 41.7% | 91.7% | 91.7% | 63.9% | 91.7% | 83.3% |
| IRB | 6 | 33.3% | 91.7% | 91.7% | 50.0% | 91.7% | 100.0% |

## Configurations

- **BM25** — Okapi BM25 alone (k1 = 1.2, b = 0.75), no fitted parameters
- **Dense** — Cosine over float32 gemini-embedding-001 vectors at 768d
- **Dense (int8)** — The same vectors quantized to int8 with one scale per vector, 4x smaller
- **Hybrid RRF (equal)** — Dense and BM25 fused by Reciprocal Rank Fusion, k = 60, both arms weighted 1
- **Hybrid RRF (weighted)** — The same fusion with the lexical arm weighted 0, chosen on the dev slice
- **Hybrid + rerank** — Top 30 weighted-fusion candidates reranked listwise by gemini-3.6-flash

## Limitations

1. **The labels are one person's judgement.** Each query was written after reading the corpus and each gold section was read to confirm it answers the query, but a relevant section nobody thought of is scored as a miss. That penalises every configuration equally, so the ordering of the rows holds even where the absolute numbers are conservative.
2. **The test slice is 32 queries.** One query moves recall by about 3.1 points. Differences smaller than that are noise, and the table should be read for its ordering, not its decimals.
3. **Two of the eight frameworks Verity classifies have no corpus.** SOC 2 (AICPA Trust Services Criteria) and ISO/IEC 27001 (Annex A) are copyrighted and cannot be redistributed here. Verity classifies documents against them and says outright that it has nothing to retrieve for them.
4. **The direct slice has little headroom.** Dense retrieval answers almost all of it, which is why the paraphrased slice exists and why it carries the headline numbers.
5. **The reranker is a language model.** Candidate order is shuffled with a fixed seed before ranking so it cannot simply echo the fusion order, and temperature is 0, but reruns will still move slightly.
