/**
 * Runs the agents against the live Gemini API, one stage at a time.
 *
 * The point is to find out which of them actually work. The project has never
 * been run end to end, so this reports each stage independently rather than
 * failing at the first error — a stage that throws should not hide whether the
 * ones after it would have succeeded.
 *
 *   npx tsx scripts/verify-agents.mts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const PROJECT = 'verify-' + 'local';

const DESCRIPTION = `
A university research platform that stores student academic records alongside
health information collected during a clinical study. Data is shared with
partner institutions in the EU. Some participants are minors.
`.trim();

const DOCUMENT = `
Data Management Plan.

Student identifiers, grades and enrollment records are stored in a Postgres
database on university infrastructure. Clinical measurements collected during
the study are held in the same database. Access is granted to researchers by
request; there is currently no formal review step. Backups are written nightly
to an S3 bucket. Data is transferred to partner institutions in Germany and
France over SFTP. Participants under 18 are enrolled with parental consent
collected on paper.
`.trim();

type StageResult = { stage: string; ok: boolean; detail: string; ms: number };
const results: StageResult[] = [];

function context() {
  return {
    projectId: PROJECT,
    sessionId: 'verify-session',
    conversationHistory: [],
    sharedState: {},
  };
}

async function stage(name: string, run: () => Promise<string>) {
  const start = Date.now();
  try {
    const detail = await run();
    results.push({ stage: name, ok: true, detail, ms: Date.now() - start });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ stage: name, ok: false, detail: message.slice(0, 220), ms: Date.now() - start });
  }
}

const { ClassificationAgent } = await import('../src/lib/agents/classification/index.js');
const { GraderAgent } = await import('../src/lib/agents/grader/index.js');
const { IdeationAgent } = await import('../src/lib/agents/ideation/index.js');

let frameworks: Array<{ name: string; confidence: number; priority: string }> = [];

await stage('classification', async () => {
  const agent = new ClassificationAgent(PROJECT);
  await agent.initialize?.();
  const out = await agent.execute({
    data: {
      projectDescription: DESCRIPTION,
      documentContent: DOCUMENT,
      analysisDepth: 'quick' as const,
    },
    context: context(),
  });
  const detected = out?.data?.detectedFrameworks ?? [];
  frameworks = detected.map((f: { name: string; confidence: number; priority: string }) => ({
    name: f.name,
    confidence: f.confidence,
    priority: f.priority,
  }));
  if (detected.length === 0) throw new Error('no frameworks detected');
  return detected
    .slice(0, 5)
    .map((f: { name: string; confidence: number }) => `${f.name} (${f.confidence?.toFixed?.(2) ?? '?'})`)
    .join(', ');
});

await stage('ideation', async () => {
  const agent = new IdeationAgent(PROJECT);
  await agent.initialize?.();
  const out = await agent.execute({
    data: {
      mode: 'questions' as const,
      context: {
        projectDescription: DESCRIPTION,
        detectedFrameworks: frameworks.map((f) => f.name),
      },
    },
    context: context(),
  });
  const questions = out?.data?.questions ?? [];
  if (questions.length === 0) {
    throw new Error(
      'no questions generated; data keys = ' +
        JSON.stringify(Object.keys(out?.data ?? {})) +
        ' errors = ' + JSON.stringify(out?.errors ?? out?.metadata?.errors ?? null)
    );
  }
  return `${questions.length} questions, first: "${String(questions[0]?.question ?? questions[0]).slice(0, 80)}"`;
});

await stage('grader', async () => {
  const agent = new GraderAgent(PROJECT);
  await agent.initialize?.();
  const out = await agent.execute({
    data: {
      frameworks: (frameworks.length
        ? frameworks
        : [{ name: 'FERPA', confidence: 0.9, priority: 'high' }]
      ).map((f) => ({
        name: f.name,
        confidence: f.confidence ?? 0.8,
        priority: (['critical', 'high', 'medium', 'low'].includes(f.priority)
          ? f.priority
          : 'medium') as 'critical' | 'high' | 'medium' | 'low',
      })),
      projectDocuments: [{ id: 'dmp', content: DOCUMENT, type: 'other' as const }],
    },
    context: context(),
  });
  const scores = out?.data?.frameworkScores ?? [];
  if (scores.length === 0) throw new Error('no framework scores produced');
  return scores
    .slice(0, 4)
    .map((s: { framework?: string; name?: string; score?: number }) =>
      `${s.framework ?? s.name}: ${s.score ?? '?'}`)
    .join(', ');
});

console.log('\n' + '─'.repeat(72));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.stage.padEnd(16)}${String(r.ms + 'ms').padStart(8)}`);
  console.log(`        ${r.detail}`);
}
const passed = results.filter((r) => r.ok).length;
console.log('─'.repeat(72));
console.log(`${passed}/${results.length} stages ran`);
if (passed !== results.length) process.exitCode = 1;
