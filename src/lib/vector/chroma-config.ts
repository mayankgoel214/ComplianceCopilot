import path from 'path';

export interface ChromaConfig {
  persist_directory: string;
  host?: string;
  port?: number;
  ssl?: boolean;
  headers?: Record<string, string>;
  collection_metadata: {
    hnsw_space: 'cosine' | 'l2' | 'ip';
    embedding_function: string;
  };
}

export const DEFAULT_CHROMA_CONFIG: ChromaConfig = {
  persist_directory: path.join(process.cwd(), 'chroma-db'),
  host: 'localhost',
  port: 8000,
  ssl: false,
  collection_metadata: {
    hnsw_space: 'cosine',
    embedding_function: 'gemini-text-embedding-004'
  }
};

export const COLLECTION_SETTINGS = {
  // Standard embedding dimension for text-embedding-004
  embedding_dimension: 768,

  // Collection naming pattern
  collection_prefix: 'project_',

  // Maximum batch size for operations
  max_batch_size: 100,

  // Default metadata fields to store with each document
  default_metadata_fields: [
    'chunk_id',
    'document_id',
    'chunk_type',
    'hierarchy_level',
    'position',
    'tokens',
    'heading_path',
    'topic_keywords',
    'semantic_density',
    'chunking_method',
    'created_at'
  ] as const
};

export function getCollectionName(projectId: string): string {
  return `${COLLECTION_SETTINGS.collection_prefix}${projectId.replace(/-/g, '_')}`;
}

export function validateProjectId(projectId: string): boolean {
  // Accept both UUID format and temporary test project IDs
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const testProjectPattern = /^test-[a-zA-Z0-9-_]+$/;

  return uuidPattern.test(projectId) || testProjectPattern.test(projectId);
}

export function sanitizeCollectionName(name: string): string {
  // ChromaDB collection names have restrictions
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .substring(0, 63); // Max length limit
}