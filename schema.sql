-- Compliance Copilot Database Schema
-- This script creates all required tables and views for the application

-- Drop existing tables and views if they exist (for clean setup)
DROP VIEW IF EXISTS project_summaries CASCADE;
DROP TABLE IF EXISTS assessments CASCADE;
DROP TABLE IF EXISTS compliance_frameworks CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table - stores user information linked to Firebase auth
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    google_refresh_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Projects table - main project entities
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) CHECK (status IN ('draft', 'analyzing', 'completed')) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Documents table - Google Drive document references
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    drive_file_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    mime_type VARCHAR(100),
    drive_url TEXT,
    parent_folder_id VARCHAR(255),
    last_modified TIMESTAMP WITH TIME ZONE,
    last_analyzed TIMESTAMP WITH TIME ZONE,
    file_size BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, drive_file_id)
);

-- Compliance frameworks table - framework configurations
CREATE TABLE compliance_frameworks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    framework_name VARCHAR(255) NOT NULL,
    confidence_score DECIMAL(5,2),
    requirements JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Assessments table - compliance assessment results
CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    framework_id UUID REFERENCES compliance_frameworks(id) ON DELETE SET NULL,
    score DECIMAL(5,2),
    gaps JSONB,
    recommendations JSONB,
    assessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Processing jobs table - tracks document processing status
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('text_extraction', 'chunking', 'embedding', 'analysis')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
    total_documents INTEGER DEFAULT 0,
    processed_documents INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    processed_chunks INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks table - stores processed document chunks
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    embedding VECTOR(768), -- For vector similarity search
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, chunk_index)
);

-- Starred documents table - user bookmarks for documents
CREATE TABLE starred_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    starred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, document_id)
);

-- Create indexes for performance
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_documents_project_id ON documents(project_id);
CREATE INDEX idx_documents_drive_file_id ON documents(drive_file_id);
CREATE INDEX idx_compliance_frameworks_project_id ON compliance_frameworks(project_id);
CREATE INDEX idx_assessments_project_id ON assessments(project_id);
CREATE INDEX idx_assessments_framework_id ON assessments(framework_id);
CREATE INDEX idx_processing_jobs_project_id ON processing_jobs(project_id);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON processing_jobs(created_at);
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_chunk_index ON document_chunks(chunk_index);
CREATE INDEX idx_starred_documents_project_id ON starred_documents(project_id);
CREATE INDEX idx_starred_documents_document_id ON starred_documents(document_id);

-- Create a trigger to automatically update the updated_at column for projects
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Project summaries view - aggregates data from multiple tables
CREATE VIEW project_summaries AS
SELECT
    p.id,
    p.name,
    p.description,
    p.status,
    p.created_at,
    p.updated_at,
    u.name as user_name,
    u.email as user_email,
    p.user_id,
    COALESCE(doc_counts.document_count, 0) as document_count,
    COALESCE(fw_counts.framework_count, 0) as framework_count,
    COALESCE(latest_assessment.latest_compliance_score, 0) as latest_compliance_score,
    latest_assessment.last_assessment_date
FROM projects p
LEFT JOIN users u ON p.user_id = u.id
LEFT JOIN (
    SELECT
        project_id,
        COUNT(*) as document_count
    FROM documents
    GROUP BY project_id
) doc_counts ON p.id = doc_counts.project_id
LEFT JOIN (
    SELECT
        project_id,
        COUNT(*) as framework_count
    FROM compliance_frameworks
    GROUP BY project_id
) fw_counts ON p.id = fw_counts.project_id
LEFT JOIN (
    SELECT DISTINCT ON (project_id)
        project_id,
        score as latest_compliance_score,
        assessed_at as last_assessment_date
    FROM assessments
    ORDER BY project_id, assessed_at DESC
) latest_assessment ON p.id = latest_assessment.project_id;

-- Grant permissions to the database owner
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neondb_owner;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO neondb_owner;

-- Insert some test data for development
INSERT INTO users (firebase_uid, email, name) VALUES
('dev-user-123', 'dev@example.com', 'Development User')
ON CONFLICT (firebase_uid) DO NOTHING;

-- Success message
SELECT 'Database schema created successfully!' as status;