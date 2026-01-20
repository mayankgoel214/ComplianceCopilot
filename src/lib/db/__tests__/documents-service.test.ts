import { DocumentsService } from '../documents-service';
import { sql } from '../neon-client';
import { Document, CreateDocumentDTO, UpdateDocumentDTO } from '../types';

// Mock the neon client
jest.mock('../neon-client', () => ({
  sql: jest.fn(),
}));

const mockSql = sql as jest.MockedFunction<typeof sql>;

describe('DocumentsService', () => {
  let documentsService: DocumentsService;

  beforeEach(() => {
    documentsService = new DocumentsService();
    jest.clearAllMocks();
  });

  describe('createDocument', () => {
    it('should create a new document successfully', async () => {
      const documentData: CreateDocumentDTO = {
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Test Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/test',
        file_size: 1024,
      };

      const mockDocument: Document = {
        id: 'test-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Test Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/test',
        parent_folder_id: null,
        last_modified: null,
        last_analyzed: null,
        file_size: 1024,
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockDocument]);

      const result = await documentsService.createDocument(documentData);

      expect(result).toEqual(mockDocument);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        documentData.project_id,
        documentData.drive_file_id,
        documentData.file_name,
        documentData.file_type,
        documentData.mime_type,
        documentData.drive_url,
        null, // parent_folder_id
        null, // last_modified
        documentData.file_size
      );
    });

    it('should handle upsert on duplicate drive_file_id', async () => {
      const documentData: CreateDocumentDTO = {
        project_id: 'test-project-id',
        drive_file_id: 'existing-drive-file-id',
        file_name: 'Updated Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
      };

      const mockDocument: Document = {
        id: 'existing-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'existing-drive-file-id',
        file_name: 'Updated Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: null,
        parent_folder_id: null,
        last_modified: null,
        last_analyzed: null,
        file_size: null,
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockDocument]);

      const result = await documentsService.createDocument(documentData);

      expect(result).toEqual(mockDocument);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        documentData.project_id,
        documentData.drive_file_id,
        documentData.file_name,
        documentData.file_type,
        documentData.mime_type,
        null, // drive_url
        null, // parent_folder_id
        null, // last_modified
        null  // file_size
      );
    });
  });

  describe('getDocumentById', () => {
    it('should return document when found', async () => {
      const mockDocument: Document = {
        id: 'test-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Test Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/test',
        parent_folder_id: null,
        last_modified: null,
        last_analyzed: null,
        file_size: 1024,
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockDocument]);

      const result = await documentsService.getDocumentById('test-document-id');

      expect(result).toEqual(mockDocument);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-document-id'
      );
    });

    it('should return null when document not found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await documentsService.getDocumentById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getDocumentByDriveFileId', () => {
    it('should return document when found by drive file id', async () => {
      const mockDocument: Document = {
        id: 'test-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Test Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/test',
        parent_folder_id: null,
        last_modified: null,
        last_analyzed: null,
        file_size: 1024,
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockDocument]);

      const result = await documentsService.getDocumentByDriveFileId('test-drive-file-id');

      expect(result).toEqual(mockDocument);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-drive-file-id'
      );
    });
  });

  describe('getDocumentsByProjectId', () => {
    it('should return documents for a project', async () => {
      const mockDocuments: Document[] = [
        {
          id: 'doc-1',
          project_id: 'test-project-id',
          drive_file_id: 'drive-file-1',
          file_name: 'Document 1.pdf',
          file_type: 'pdf',
          mime_type: 'application/pdf',
          drive_url: 'https://drive.google.com/file/d/1',
          parent_folder_id: null,
          last_modified: null,
          last_analyzed: null,
          file_size: 1024,
          created_at: new Date(),
        },
        {
          id: 'doc-2',
          project_id: 'test-project-id',
          drive_file_id: 'drive-file-2',
          file_name: 'Document 2.docx',
          file_type: 'docx',
          mime_type: 'application/vnd.google-apps.document',
          drive_url: 'https://drive.google.com/file/d/2',
          parent_folder_id: null,
          last_modified: null,
          last_analyzed: null,
          file_size: 2048,
          created_at: new Date(),
        },
      ];

      mockSql.mockResolvedValue(mockDocuments);

      const result = await documentsService.getDocumentsByProjectId('test-project-id');

      expect(result).toEqual(mockDocuments);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id'
      );
    });

    it('should return empty array when no documents found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await documentsService.getDocumentsByProjectId('empty-project-id');

      expect(result).toEqual([]);
    });
  });

  describe('updateDocument', () => {
    it('should update document with multiple fields', async () => {
      const updateData: UpdateDocumentDTO = {
        file_name: 'Updated Document.pdf',
        last_modified: new Date(),
        last_analyzed: new Date(),
        file_size: 2048,
      };

      const mockUpdatedDocument: Document = {
        id: 'test-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Updated Document.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/test',
        parent_folder_id: null,
        last_modified: updateData.last_modified!,
        last_analyzed: updateData.last_analyzed!,
        file_size: 2048,
        created_at: new Date(),
      };

      const mockUnsafe = jest.fn().mockResolvedValue([mockUpdatedDocument]);
      (mockSql as any).unsafe = mockUnsafe;

      const result = await documentsService.updateDocument('test-document-id', updateData);

      expect(result).toEqual(mockUpdatedDocument);
      expect(mockUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents'),
        expect.arrayContaining(['Updated Document.pdf', updateData.last_modified, updateData.last_analyzed, 2048, 'test-document-id'])
      );
    });

    it('should throw error when no fields to update', async () => {
      const updateData: UpdateDocumentDTO = {};

      await expect(documentsService.updateDocument('test-document-id', updateData))
        .rejects.toThrow('No fields to update');
    });
  });

  describe('markDocumentAsAnalyzed', () => {
    it('should update last_analyzed timestamp', async () => {
      mockSql.mockResolvedValue([]);

      await documentsService.markDocumentAsAnalyzed('test-document-id');

      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-document-id'
      );
    });
  });

  describe('getDocumentsNeedingAnalysis', () => {
    it('should return documents that need analysis', async () => {
      const mockDocuments: Document[] = [
        {
          id: 'doc-1',
          project_id: 'test-project-id',
          drive_file_id: 'drive-file-1',
          file_name: 'Unanalyzed Document.pdf',
          file_type: 'pdf',
          mime_type: 'application/pdf',
          drive_url: 'https://drive.google.com/file/d/1',
          parent_folder_id: null,
          last_modified: new Date(),
          last_analyzed: null, // Never analyzed
          file_size: 1024,
          created_at: new Date(),
        },
      ];

      mockSql.mockResolvedValue(mockDocuments);

      const result = await documentsService.getDocumentsNeedingAnalysis('test-project-id');

      expect(result).toEqual(mockDocuments);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id'
      );
    });
  });

  describe('syncDocumentMetadata', () => {
    it('should sync document metadata from Drive API', async () => {
      const metadata = {
        name: 'Updated Document Name.pdf',
        mimeType: 'application/pdf',
        modifiedTime: '2023-01-01T12:00:00Z',
        size: '2048',
        webViewLink: 'https://drive.google.com/file/d/updated',
      };

      const mockUpdatedDocument: Document = {
        id: 'test-document-id',
        project_id: 'test-project-id',
        drive_file_id: 'test-drive-file-id',
        file_name: 'Updated Document Name.pdf',
        file_type: 'pdf',
        mime_type: 'application/pdf',
        drive_url: 'https://drive.google.com/file/d/updated',
        parent_folder_id: null,
        last_modified: new Date('2023-01-01T12:00:00Z'),
        last_analyzed: null,
        file_size: 2048,
        created_at: new Date(),
      };

      mockSql.mockResolvedValue([mockUpdatedDocument]);

      const result = await documentsService.syncDocumentMetadata('test-drive-file-id', metadata);

      expect(result).toEqual(mockUpdatedDocument);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        metadata.name,
        metadata.mimeType,
        metadata.modifiedTime,
        2048,
        metadata.webViewLink,
        'test-drive-file-id'
      );
    });

    it('should return null when document not found', async () => {
      const metadata = {
        name: 'Document.pdf',
        mimeType: 'application/pdf',
        modifiedTime: '2023-01-01T12:00:00Z',
        webViewLink: 'https://drive.google.com/file/d/test',
      };

      mockSql.mockResolvedValue([]);

      const result = await documentsService.syncDocumentMetadata('nonexistent-drive-file-id', metadata);

      expect(result).toBeNull();
    });
  });

  describe('getProjectDocumentStats', () => {
    it('should return document statistics for a project', async () => {
      const mockStats = {
        total_documents: 5,
        analyzed_documents: 3,
        pending_documents: 2,
        last_analyzed_date: new Date(),
      };

      mockSql.mockResolvedValue([mockStats]);

      const result = await documentsService.getProjectDocumentStats('test-project-id');

      expect(result).toEqual({
        totalDocuments: 5,
        analyzedDocuments: 3,
        pendingDocuments: 2,
        lastAnalyzedDate: mockStats.last_analyzed_date,
      });

      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-project-id'
      );
    });

    it('should return default stats when no documents found', async () => {
      mockSql.mockResolvedValue([]);

      const result = await documentsService.getProjectDocumentStats('empty-project-id');

      expect(result).toEqual({
        totalDocuments: 0,
        analyzedDocuments: 0,
        pendingDocuments: 0,
      });
    });
  });

  describe('isDocumentInProject', () => {
    it('should return true when document belongs to project', async () => {
      mockSql.mockResolvedValue([{ 1: 1 }]);

      const result = await documentsService.isDocumentInProject('test-document-id', 'test-project-id');

      expect(result).toBe(true);
      expect(mockSql).toHaveBeenCalledWith(
        expect.anything(),
        'test-document-id',
        'test-project-id'
      );
    });

    it('should return false when document does not belong to project', async () => {
      mockSql.mockResolvedValue([]);

      const result = await documentsService.isDocumentInProject('test-document-id', 'wrong-project-id');

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockSql.mockRejectedValue(new Error('Database error'));

      const result = await documentsService.isDocumentInProject('test-document-id', 'test-project-id');

      expect(result).toBe(false);
    });
  });
});