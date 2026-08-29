import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Content-addressed cache for embeddings, used by the offline build and the
 * evaluation harness.
 *
 * The corpus is rebuilt whenever chunking changes, but most chunks are
 * unaffected by any given change. Without this, every chunking experiment costs
 * a full re-embed of the corpus; with it, only the chunks whose text actually
 * moved are re-embedded. The key includes the model and dimension count so a
 * change to either invalidates the cache rather than silently mixing vector
 * spaces — which would produce an index that looks fine and retrieves nonsense.
 */
export class EmbeddingCache {
  private memory = new Map<string, number[]>();
  private loaded = false;
  private dirty = false;

  constructor(
    private readonly file: string,
    private readonly model: string,
    private readonly dimensions: number
  ) {}

  private key(text: string): string {
    return createHash("sha256")
      .update(`${this.model} ${this.dimensions} ${text}`)
      .digest("hex");
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as Record<string, number[]>;
      for (const [k, v] of Object.entries(parsed)) this.memory.set(k, v);
    } catch {
      // A missing or unreadable cache is a cold cache, not an error.
    }
    this.loaded = true;
  }

  get(text: string): number[] | undefined {
    return this.memory.get(this.key(text));
  }

  set(text: string, vector: number[]): void {
    this.memory.set(this.key(text), vector);
    this.dirty = true;
  }

  get size(): number {
    return this.memory.size;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(Object.fromEntries(this.memory)), "utf8");
    this.dirty = false;
  }
}
