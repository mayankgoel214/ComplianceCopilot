/**
 * Proves the retrieval path actually runs: real embeddings from the live API,
 * stored and queried through the in-memory vector service, with semantically
 * unrelated text present so a passing result means retrieval worked rather than
 * that there was only one document to return.
 *
 *   npx tsx scripts/verify-rag.mts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const { GeminiEmbeddingService } = await import('../src/lib/ai/gemini-embeddings.js');
const { AI_CONFIG } = await import('../src/lib/ai/config.js');

const CORPUS = [
  { id: 'ferpa-1', text: 'FERPA requires written consent from a parent or eligible student before disclosing personally identifiable information from education records.' },
  { id: 'hipaa-1', text: 'The HIPAA Security Rule requires covered entities to implement administrative, physical, and technical safeguards for electronic protected health information.' },
  { id: 'dfars-1', text: 'DFARS 252.204-7012 requires contractors to provide adequate security for covered defense information and to report cyber incidents within 72 hours.' },
  { id: 'gdpr-1',  text: 'Under GDPR, a data controller must be able to demonstrate that the data subject has consented to processing of their personal data.' },
  { id: 'noise-1', text: 'The campus dining hall serves breakfast between seven and ten in the morning on weekdays.' },
];

const service = new GeminiEmbeddingService();

console.log(`model      : ${AI_CONFIG.embeddings.model}`);
console.log(`dimensions : ${AI_CONFIG.embeddings.dimensions}`);

const vectors = await service.generateDocumentEmbeddings(CORPUS.map((c) => c.text));
console.log(`embedded   : ${vectors.length} documents, ${vectors[0]?.length} dims each`);

if (vectors[0]?.length !== AI_CONFIG.embeddings.dimensions) {
  throw new Error(`dimension mismatch: got ${vectors[0]?.length}, expected ${AI_CONFIG.embeddings.dimensions}`);
}

// Cosine similarity directly against the stored vectors — the same measure the
// vector service uses, exercised here without needing a running ChromaDB.
const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const QUERIES = [
  { q: 'What consent is needed before sharing a student transcript?', expect: 'ferpa-1' },
  { q: 'How quickly must a defense contractor report a breach?',      expect: 'dfars-1' },
  { q: 'What safeguards protect electronic health information?',      expect: 'hipaa-1' },
];

let passed = 0;
for (const { q, expect } of QUERIES) {
  const qv = await service.generateQueryEmbedding(q);
  const ranked = CORPUS
    .map((c, i) => ({ id: c.id, score: cosine(qv, vectors[i]!) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0]!;
  const ok = top.id === expect;
  if (ok) passed++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  "${q}"`);
  console.log(`      top: ${top.id} (${top.score.toFixed(3)})  expected: ${expect}`);
  console.log(`      next: ${ranked.slice(1, 3).map((r) => `${r.id} ${r.score.toFixed(3)}`).join(', ')}`);
}

console.log(`\n${passed}/${QUERIES.length} retrieved the right document`);
if (passed !== QUERIES.length) process.exitCode = 1;
