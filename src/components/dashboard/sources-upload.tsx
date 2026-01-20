'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { HardDrive, Plus, FileText, Folder } from 'lucide-react';
import { GoogleDrivePicker } from '@/components/processor/google-drive-picker';
import { SourceFileList } from './source-file-list';

interface SourcesUploadProps {
  projectId: string;
  onFolderSelected: (folderId: string) => Promise<void>;
  hasUploadedSources: boolean;
  selectedFiles?: string[];
  selectedFolders?: string[];
  disabled?: boolean;
}

export function SourcesUpload({
  projectId,
  onFolderSelected,
  hasUploadedSources,
  selectedFiles = [],
  selectedFolders = [],
  disabled = false
}: SourcesUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'folders' | 'files' | 'both'>('both');

  const handleFolderSelect = async (folderId: string) => {
    try {
      setIsUploading(true);
      setError(null);
      await onFolderSelected(folderId);
    } catch (error) {
      console.error('Error selecting folder:', error);
      setError(error instanceof Error ? error.message : 'Failed to add sources');
    } finally {
      setIsUploading(false);
    }
  };

  if (hasUploadedSources) {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <HardDrive size={48} className="mx-auto text-green-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Sources Connected
          </h3>
          <p className="text-gray-600 mb-4">
            Your Google Drive sources have been successfully connected
          </p>
          <div className="text-sm text-green-600 space-y-1">
            <p>
              {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} connected
            </p>
            {selectedFolders.length > 0 && (
              <p>
                {selectedFolders.length} folder{selectedFolders.length !== 1 ? 's' : ''} connected
              </p>
            )}
          </div>
        </div>

        {/* Display folder contents for the first connected folder */}
        {selectedFolders.length > 0 && (
          <SourceFileList
            projectId={projectId}
            folderId={selectedFolders[0]}
            onFileLinked={(fileId) => {
              console.log('File linked:', fileId);
            }}
            onFileRemoved={(fileId) => {
              console.log('File removed:', fileId);
            }}
            onFileStarred={(fileId, starred) => {
              console.log('File starred:', fileId, starred);
            }}
          />
        )}

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-900">Add More Sources</h4>
                <p className="text-sm text-gray-600">
                  Connect additional files or folders from Google Drive
                </p>
              </div>
              <GoogleDrivePicker
                onSelectFile={handleFolderSelect}
                selectedFiles={selectedFiles}
                disabled={disabled || isUploading}
                preferFolders={true}
                selectionMode={selectionMode}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Upload Area */}
      <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors">
        <CardContent className="p-12">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6">
              <HardDrive size={32} className="text-blue-600" />
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Add Sources
            </h3>

            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Connect files or folders from Google Drive to analyze compliance requirements and generate insights
            </p>

            {/* Selection Mode Toggle */}
            <div className="flex justify-center mb-4 gap-2">
              <Button
                variant={selectionMode === 'files' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode('files')}
                disabled={disabled || isUploading}
              >
                <FileText className="mr-2 h-4 w-4" />
                Files Only
              </Button>
              <Button
                variant={selectionMode === 'folders' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode('folders')}
                disabled={disabled || isUploading}
              >
                <Folder className="mr-2 h-4 w-4" />
                Folders Only
              </Button>
              <Button
                variant={selectionMode === 'both' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode('both')}
                disabled={disabled || isUploading}
              >
                <HardDrive className="mr-2 h-4 w-4" />
                Both
              </Button>
            </div>

            <GoogleDrivePicker
              onSelectFile={handleFolderSelect}
              selectedFiles={selectedFiles}
              disabled={disabled || isUploading}
              preferFolders={selectionMode === 'folders'}
              selectionMode={selectionMode}
            />

            {isUploading && (
              <div className="mt-4">
                <p className="text-sm text-blue-600">
                  Connecting to Google Drive...
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alternative Upload Link */}
      <div className="text-center">
        <GoogleDrivePicker
          onSelectFile={handleFolderSelect}
          selectedFiles={selectedFiles}
          disabled={disabled || isUploading}
          variant="link"
          preferFolders={selectionMode === 'folders'}
          selectionMode={selectionMode}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}