-- Verity's database.
--
-- Two things live here, and they are unrelated to each other on purpose.
--
-- `corpus_chunks` is the scale-out path for retrieval. The application does not
-- read from it: the shipped corpus is about a thousand passages and an
-- exhaustive scan of a flat Float32Array answers in a millisecond, so putting a
-- network round trip in front of that would be slower and no more correct. It
-- exists, is populated by scripts/push-corpus.mts, and is exercised by the
-- integration tests, because a persistence layer nobody has ever run is not a
-- persistence layer — which is exactly what the ChromaDB client that used to be
-- here turned out to be.
--
-- `reports` is what makes an assessment survive a refresh and be sendable to
-- somebody else.
--
-- Idempotent throughout, so re-running against a partially built database is
-- safe rather than a decision about how brave you feel.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Retrieval corpus
-- ---------------------------------------------------------------------------

create table if not exists corpus_chunks (
  id          text primary key,
  framework   text        not null,
  citation    text        not null,
  heading     text        not null,
  source      text        not null,
  source_url  text        not null,
  content     text        not null,
  tokens      integer     not null,
  ordinal     integer     not null,
  ordinal_of  integer     not null,
  embedding   vector(768) not null,
  -- Generated rather than trigger-maintained, so it cannot drift out of sync
  -- with the content it indexes. Citation and heading are included because a
  -- query is as likely to name a section as to describe it.
  content_tsv tsvector generated always as (
                to_tsvector('english', citation || ' ' || heading || ' ' || content)
              ) stored,
  created_at  timestamptz not null default now()
);

create index if not exists corpus_chunks_tsv_idx on corpus_chunks using gin (content_tsv);
create index if not exists corpus_chunks_framework_idx on corpus_chunks (framework);
create index if not exists corpus_chunks_citation_idx on corpus_chunks (citation);

-- HNSW with cosine ops, matching the unit-normalised vectors the build writes.
-- Created last because it is the expensive part: a failure here leaves a usable
-- table rather than a half-built index.
create index if not exists corpus_chunks_embedding_idx
  on corpus_chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Saved assessments
-- ---------------------------------------------------------------------------

create table if not exists reports (
  -- A short random id, generated in the application. Unguessable rather than
  -- sequential, because these are shared by link and a sequential id would let
  -- anyone walk the whole table.
  id            text primary key,

  -- The submitted document, stored because a report whose findings cannot be
  -- checked against their source is the thing this project exists not to be.
  -- It is deleted with the row when the row expires.
  document      text not null,
  document_hash text not null,

  -- The whole AssessmentResult, including the trace. Stored as one document
  -- because it is read as one document and never queried by its innards.
  result        jsonb not null,

  -- Denormalised out of `result` so the retention job and any future listing
  -- can work without parsing every blob.
  framework_count integer not null,
  finding_count   integer not null,
  grounded_rate   real    not null,

  created_at    timestamptz not null default now(),
  -- Retention is a promise the interface makes to whoever pasted a document
  -- into it, so it is written down here rather than left to a cron nobody runs.
  expires_at    timestamptz not null default now() + interval '30 days',
  -- A pinned report is exempt from retention. Exactly one exists: the worked
  -- example linked from the front page, so that a visitor can read a finished
  -- assessment without spending a model call — and can still read one when the
  -- model is unavailable, which is not hypothetical.
  pinned        boolean not null default false
);

alter table reports add column if not exists pinned boolean not null default false;

create index if not exists reports_expires_idx on reports (expires_at);
-- Supports the cache lookup: the newest unexpired report for an identical
-- document. Descending, because that query only ever wants the first row.
create index if not exists reports_hash_created_idx on reports (document_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------

-- Called on write rather than scheduled. A cron job is the better answer for a
-- busy database; for one that sees a handful of writes an hour, a sweep on
-- insert is fewer moving parts and cannot silently stop running.
create or replace function purge_expired_reports() returns integer
language sql
as $$
  with deleted as (delete from reports where expires_at < now() and not pinned returning 1)
  select count(*)::integer from deleted;
$$;
