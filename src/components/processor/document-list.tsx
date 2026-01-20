"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Plus,
  ExternalLink,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Calendar,
  FileIcon,
} from "lucide-react";
import { Document } from "@/lib/db/types";

interface DocumentListProps {
  documents: Document[];
  isLoading?: boolean;
  onLinkDocument?: () => void;
  onUnlinkDocument?: (documentId: string) => Promise<void>;
  onRefreshDocuments?: () => Promise<void>;
  showActions?: boolean;
}

export function DocumentList({
  documents,
  isLoading = false,
  onLinkDocument,
  onUnlinkDocument,
  onRefreshDocuments,
  showActions = true,
}: DocumentListProps) {
  const [unlinkingIds, setUnlinkingIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const handleUnlinkDocument = async (documentId: string) => {
    if (!onUnlinkDocument) return;

    try {
      setUnlinkingIds((prev) => new Set(prev).add(documentId));
      await onUnlinkDocument(documentId);
    } catch (error) {
      console.error("Error unlinking document:", error);
    } finally {
      setUnlinkingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(documentId);
        return newSet;
      });
    }
  };

  const handleRefresh = async () => {
    if (!onRefreshDocuments) return;

    try {
      setRefreshing(true);
      await onRefreshDocuments();
    } catch (error) {
      console.error("Error refreshing documents:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.includes("google-apps.document")) {
      return <FileText size={16} className="text-blue-600" />;
    }
    if (mimeType?.includes("google-apps.spreadsheet")) {
      return <FileIcon size={16} className="text-green-600" />;
    }
    if (mimeType?.includes("google-apps.presentation")) {
      return <FileIcon size={16} className="text-orange-600" />;
    }
    if (
      mimeType?.includes("wordprocessingml.document") ||
      mimeType?.includes("msword")
    ) {
      return <FileText size={16} className="text-blue-600" />;
    }
    if (mimeType?.includes("pdf")) {
      return <FileIcon size={16} className="text-red-600" />;
    }
    return <FileText size={16} className="text-gray-600" />;
  };

  const getFileTypeBadge = (mimeType: string, fileType: string) => {
    if (mimeType?.includes("google-apps.document")) return "Google Doc";
    if (mimeType?.includes("google-apps.spreadsheet")) return "Google Sheet";
    if (mimeType?.includes("google-apps.presentation")) return "Google Slides";
    if (mimeType?.includes("wordprocessingml.document")) return "DOCX";
    if (mimeType?.includes("msword")) return "DOC";
    if (mimeType?.includes("pdf")) return "PDF";
    return fileType || "Unknown";
  };

  const isDocumentStale = (document: Document) => {
    if (!document.last_modified || !document.last_analyzed) return false;
    return new Date(document.last_modified) > new Date(document.last_analyzed);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Linked Documents</CardTitle>
              <CardDescription>Loading documents...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Linked Documents</CardTitle>
            <CardDescription>
              Google Drive files linked to this project
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {onRefreshDocuments && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw
                  size={16}
                  className={refreshing ? "animate-spin" : ""}
                />
                Refresh
              </Button>
            )}
            {onLinkDocument && (
              <Button
                onClick={onLinkDocument}
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Link Document
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No documents linked
            </h3>
            <p className="text-gray-600 mb-4">
              Link Google Drive documents to analyze compliance requirements
            </p>
            {onLinkDocument && (
              <Button
                onClick={onLinkDocument}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Link Your First Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <span>{documents.length} documents linked</span>
              <span>
                {documents.filter((doc) => doc.last_analyzed).length} analyzed
              </span>
            </div>

            {/* Documents Table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead>Status</TableHead>
                  {showActions && (
                    <TableHead className="w-[100px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.mime_type || "")}
                        <div>
                          <div className="font-medium">{doc.file_name}</div>
                          {isDocumentStale(doc) && (
                            <div className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle size={12} />
                              <span>Modified since last analysis</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getFileTypeBadge(
                          doc.mime_type || "",
                          doc.file_type || ""
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar size={12} />
                        {doc.last_modified
                          ? new Date(doc.last_modified).toLocaleDateString()
                          : "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc.last_analyzed ? (
                        <Badge
                          variant={
                            isDocumentStale(doc) ? "secondary" : "default"
                          }
                        >
                          {isDocumentStale(doc) ? "Needs Analysis" : "Analyzed"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    {showActions && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(doc.drive_url || "", "_blank")
                            }
                            disabled={!doc.drive_url}
                          >
                            <ExternalLink size={14} />
                          </Button>
                          {onUnlinkDocument && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnlinkDocument(doc.id)}
                              disabled={unlinkingIds.has(doc.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
