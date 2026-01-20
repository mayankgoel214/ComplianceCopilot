// Database entity types

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  name?: string;
  google_refresh_token?: string;
  created_at: Date;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  use_case?: string;
  status: 'draft' | 'analyzing' | 'completed';
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  project_id: string;
  drive_file_id: string;
  file_name: string;
  file_type?: string;
  mime_type?: string;
  drive_url?: string;
  parent_folder_id?: string;
  last_modified?: Date;
  last_analyzed?: Date;
  file_size?: number;
  created_at: Date;
}

export interface ComplianceFramework {
  id: string;
  project_id: string;
  framework_name: string;
  confidence_score?: number;
  requirements?: Record<string, any>;
  created_at: Date;
}

export interface Assessment {
  id: string;
  project_id: string;
  framework_id?: string;
  score?: number;
  gaps?: Record<string, any>;
  recommendations?: Record<string, any>;
  assessed_at: Date;
}

export interface StarredDocument {
  id: string;
  project_id: string;
  document_id: string;
  starred_at: Date;
}

// View types
export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  use_case?: string;
  status: Project['status'];
  created_at: Date;
  updated_at: Date;
  user_name?: string;
  user_email: string;
  document_count: number;
  framework_count: number;
  latest_compliance_score: number;
  last_assessment_date: Date;
}

// Input/Output DTOs
export interface CreateUserDTO {
  firebase_uid: string;
  email: string;
  name?: string;
  google_refresh_token?: string;
}

export interface CreateProjectDTO {
  user_id: string;
  name: string;
  description?: string;
  use_case?: string;
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  use_case?: string;
  status?: Project['status'];
}

export interface CreateDocumentDTO {
  project_id: string;
  drive_file_id: string;
  file_name: string;
  file_type?: string;
  mime_type?: string;
  drive_url?: string;
  parent_folder_id?: string;
  last_modified?: Date;
  file_size?: number;
}

export interface UpdateDocumentDTO {
  file_name?: string;
  file_type?: string;
  mime_type?: string;
  drive_url?: string;
  last_modified?: Date;
  last_analyzed?: Date;
  file_size?: number;
}

export interface CreateStarredDocumentDTO {
  project_id: string;
  document_id: string;
}

// Google Drive API types
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  parents?: string[];
  thumbnailLink?: string;
  iconLink?: string;
}

export interface DriveFileContent {
  fileId: string;
  content: string;
  mimeType: string;
  extractedAt: Date;
}

export interface DocumentWithStarred extends Document {
  is_starred: boolean;
  starred_at?: Date;
}

// Compliance types
export interface ComplianceRequirement {
  id: string;
  title: string;
  description: string;
  category: string;
  required: boolean;
  implemented: boolean;
  evidence?: string[];
}

export interface ComplianceGap {
  requirement_id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
  estimated_effort: string;
}

export interface ComplianceRecommendation {
  title: string;
  description: string;
  action_items: string[];
  priority: 'high' | 'medium' | 'low';
  estimated_effort: string;
  templates?: string[];
}