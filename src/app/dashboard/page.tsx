'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Shield,
  Lightbulb,
  Folder,
  HardDrive,
  Plus
} from 'lucide-react';
import { EnterpriseLayout } from '@/components/enterprise/layout';
import { SourcesUpload } from '@/components/dashboard/sources-upload';
import { IdeateSection } from '@/components/dashboard/ideate/ideate-section';
import { CompliancePlaceholder } from '@/components/dashboard/compliance-placeholder';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('sources');
  const [hasUploadedSources, setHasUploadedSources] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Mock project data for demonstration
  const mockProject = {
    id: "demo-project-123",
    name: "Demo Compliance Project",
    description: "This is a demonstration of the dashboard functionality",
    status: "draft"
  };

  const handleFolderSelect = async (folderId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Add the folder to selected files
      setSelectedFiles(prev => [...prev, folderId]);
      setHasUploadedSources(true);

      console.log('Folder selected:', folderId);
    } catch (error) {
      console.error('Error selecting folder:', error);
      throw error;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'analyzing':
        return 'secondary';
      case 'draft':
      default:
        return 'outline';
    }
  };

  return (
    <EnterpriseLayout>
      <div className="container mx-auto">
        {/* Project Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{mockProject.name}</h1>
            <Badge variant={getStatusBadgeVariant(mockProject.status)}>
              {mockProject.status}
            </Badge>
          </div>
          <p className="text-gray-600">
            {mockProject.description}
          </p>
        </div>

        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="dashboard-tabs grid w-full grid-cols-3 max-w-2xl mx-auto mb-8 h-12 p-1">
            <TabsTrigger
              value="sources"
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Folder size={18} />
              <span>Sources</span>
            </TabsTrigger>
            <TabsTrigger
              value="ideate"
              disabled={!hasUploadedSources}
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Lightbulb size={18} />
              <span>Ideate</span>
            </TabsTrigger>
            <TabsTrigger
              value="compliance-report"
              disabled={!hasUploadedSources}
              className="flex items-center gap-2 h-10 px-6 transition-all duration-200"
            >
              <Shield size={18} />
              <span>Compliance Report</span>
            </TabsTrigger>
          </TabsList>

          {/* Sources Tab */}
          <TabsContent value="sources" className="mt-6">
            <SourcesUpload
              projectId={mockProject.id}
              onFolderSelected={handleFolderSelect}
              hasUploadedSources={hasUploadedSources}
              selectedFiles={selectedFiles}
              disabled={isAnalyzing}
            />
          </TabsContent>

          {/* Ideate Tab */}
          <TabsContent value="ideate" className="mt-6">
            <IdeateSection isLocked={!hasUploadedSources} />
          </TabsContent>

          {/* Compliance Report Tab */}
          <TabsContent value="compliance-report" className="mt-6">
            <CompliancePlaceholder isLocked={!hasUploadedSources} />
          </TabsContent>
        </Tabs>

        {/* Sources Menu Placeholder */}
        {hasUploadedSources && (
          <div className="mt-12">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sources Menu</CardTitle>
                <CardDescription>
                  Connected Google Drive files and folders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-gray-500 text-center py-4">
                  <p className="text-sm">Connected sources will be displayed here</p>
                  {selectedFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs mt-1">
                        {selectedFiles.length} item{selectedFiles.length !== 1 ? 's' : ''} currently linked
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {selectedFiles.map((fileId, index) => (
                          <Badge key={fileId} variant="secondary" className="text-xs">
                            <HardDrive size={12} className="mr-1" />
                            Item {index + 1}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Demo Instructions */}
        <div className="mt-12">
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-lg text-blue-900">Dashboard Demo</CardTitle>
              <CardDescription className="text-blue-700">
                This is a demonstration of the project dashboard functionality
              </CardDescription>
            </CardHeader>
            <CardContent className="text-blue-800">
              <div className="space-y-2 text-sm">
                <p>🎯 <strong>Current Tab:</strong> Sources (always accessible)</p>
                <p>🔒 <strong>Locked Tabs:</strong> Ideate & Compliance Report (unlock by uploading sources)</p>
                <p>📁 <strong>Upload Process:</strong> Choose between Files, Folders, or Both, then select from Google Drive</p>
                <p>✨ <strong>After Upload:</strong> Ideate and Compliance Report tabs will unlock automatically</p>
                <p>📱 <strong>Mobile Ready:</strong> Resize your browser to see responsive design</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </EnterpriseLayout>
  );
}