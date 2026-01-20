-- Semantic Chunking Migration
-- Adds tables for document chunking, embeddings, and vector storage tracking

-- Document chunks table - stores individual chunks with hierarchy and semantic metadata
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL,
    position INTEGER NOT NULL, -- absolute position in document

    -- Hierarchy metadata
    heading_path TEXT[] DEFAULT '{}', -- array of heading hierarchy
    hierarchy_level INTEGER DEFAULT 0, -- depth in document tree
    parent_section_id UUID REFERENCES document_chunks(id),
    chunk_type VARCHAR(50) CHECK (chunk_type IN ('heading', 'paragraph', 'mixed', 'table', 'list', 'code')) DEFAULT 'paragraph',

    -- Semantic metadata
    semantic_density DECIMAL(5,3), -- coherence score 0-1
    topic_keywords TEXT[] DEFAULT '{}', -- extracted key terms
    has_overlap_previous BOOLEAN DEFAULT FALSE,
    has_overlap_next BOOLEAN DEFAULT FALSE,
    overlap_text TEXT, -- overlapping portion with adjacent chunks

    -- Relationships
    previous_chunk_id UUID REFERENCES document_chunks(id),
    next_chunk_id UUID REFERENCES document_chunks(id),
    sibling_chunk_ids UUID[] DEFAULT '{}', -- same-level chunks
    child_chunk_ids UUID[] DEFAULT '{}', -- nested content chunks

    -- Processing metadata
    chunking_method VARCHAR(20) CHECK (chunking_method IN ('structural', 'semantic', 'hybrid')) DEFAULT 'hybrid',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(document_id, position)
);

-- Vector collections table - tracks ChromaDB collections per project
CREATE TABLE vector_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    collection_name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    chunk_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(project_id)
);

-- Chunk embeddings table - tracks embeddings stored in ChromaDB
CREATE TABLE chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES vector_collections(id) ON DELETE CASCADE,
    chroma_document_id VARCHAR(255) NOT NULL, -- ID in ChromaDB
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-004',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(chunk_id),
    UNIQUE(collection_id, chroma_document_id)
);

-- Processing jobs table - tracks document processing status
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE, -- NULL for project-wide processing
    job_type VARCHAR(50) CHECK (job_type IN ('extract', 'chunk', 'embed', 'index', 'full_pipeline')) DEFAULT 'full_pipeline',
    status VARCHAR(20) CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',

    -- Progress tracking
    total_documents INTEGER,
    processed_documents INTEGER DEFAULT 0,
    total_chunks INTEGER,
    processed_chunks INTEGER DEFAULT 0,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_position ON document_chunks(document_id, position);
CREATE INDEX idx_document_chunks_hierarchy_level ON document_chunks(hierarchy_level);
CREATE INDEX idx_document_chunks_chunk_type ON document_chunks(chunk_type);
CREATE INDEX idx_document_chunks_parent_section ON document_chunks(parent_section_id);
CREATE INDEX idx_document_chunks_heading_path ON document_chunks USING GIN(heading_path);
CREATE INDEX idx_document_chunks_topic_keywords ON document_chunks USING GIN(topic_keywords);

CREATE INDEX idx_vector_collections_project_id ON vector_collections(project_id);
CREATE INDEX idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);
CREATE INDEX idx_chunk_embeddings_collection_id ON chunk_embeddings(collection_id);

CREATE INDEX idx_processing_jobs_project_id ON processing_jobs(project_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_job_type ON processing_jobs(job_type);
CREATE INDEX idx_processing_jobs_document_id ON processing_jobs(document_id);

-- Create trigger for updating processing_jobs updated_at
CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for updating vector_collections last_updated
CREATE TRIGGER update_vector_collections_last_updated
    BEFORE UPDATE ON vector_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure chunk relationships are valid
ALTER TABLE document_chunks
ADD CONSTRAINT check_chunk_relationships
CHECK (
    (previous_chunk_id IS NULL OR previous_chunk_id != id) AND
    (next_chunk_id IS NULL OR next_chunk_id != id) AND
    (parent_section_id IS NULL OR parent_section_id != id)
);

-- Create view for chunk statistics per document
CREATE VIEW document_chunk_stats AS
SELECT
    d.id as document_id,
    d.file_name,
    d.project_id,
    COUNT(dc.id) as total_chunks,
    COUNT(CASE WHEN dc.chunk_type = 'heading' THEN 1 END) as heading_chunks,
    COUNT(CASE WHEN dc.chunk_type = 'paragraph' THEN 1 END) as paragraph_chunks,
    COUNT(CASE WHEN dc.chunk_type = 'table' THEN 1 END) as table_chunks,
    COUNT(CASE WHEN dc.chunk_type = 'list' THEN 1 END) as list_chunks,
    SUM(dc.tokens) as total_tokens,
    AVG(dc.tokens) as avg_tokens_per_chunk,
    MAX(dc.hierarchy_level) as max_hierarchy_depth,
    COUNT(DISTINCT array_to_string(dc.heading_path, ' > ')) as unique_sections
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id, d.file_name, d.project_id;

-- Create view for processing job summaries
CREATE VIEW processing_job_summaries AS
SELECT
    pj.id,
    pj.project_id,
    p.name as project_name,
    pj.job_type,
    pj.status,
    pj.total_documents,
    pj.processed_documents,
    pj.total_chunks,
    pj.processed_chunks,
    CASE
        WHEN pj.total_documents > 0 THEN
            ROUND((pj.processed_documents::DECIMAL / pj.total_documents) * 100, 2)
        ELSE 0
    END as document_progress_percent,
    CASE
        WHEN pj.total_chunks > 0 THEN
            ROUND((pj.processed_chunks::DECIMAL / pj.total_chunks) * 100, 2)
        ELSE 0
    END as chunk_progress_percent,
    pj.started_at,
    pj.completed_at,
    CASE
        WHEN pj.completed_at IS NOT NULL AND pj.started_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (pj.completed_at - pj.started_at))
        ELSE NULL
    END as duration_seconds,
    pj.error_message,
    pj.retry_count,
    pj.created_at
FROM processing_jobs pj
LEFT JOIN projects p ON pj.project_id = p.id;

-- Grant permissions
GRANT ALL PRIVILEGES ON document_chunks TO neondb_owner;
GRANT ALL PRIVILEGES ON vector_collections TO neondb_owner;
GRANT ALL PRIVILEGES ON chunk_embeddings TO neondb_owner;
GRANT ALL PRIVILEGES ON processing_jobs TO neondb_owner;
GRANT ALL PRIVILEGES ON document_chunk_stats TO neondb_owner;
GRANT ALL PRIVILEGES ON processing_job_summaries TO neondb_owner;

-- Success message
SELECT 'Semantic chunking migration completed successfully!' as status;