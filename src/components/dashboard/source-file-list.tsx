"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Star,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Link,
  Link2Off,
  Plus,
} from "lucide-react";
import { FileTypeIcon, getFileTypeName } from "./file-type-icon";
import { SourceActionToolbar } from "./source-action-toolbar";
import { cn } from "@/lib/utils";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
  isLinkedToProject: boolean;
  isStarred: boolean;
  documentId: string | null;
  fileSize: number | null;
  lastModified: Date | null;
}

interface SourceFileListProps {
  projectId: string;
  folderId: string;
  className?: string;
  onFileLinked?: (fileId: string) => void;
  onFileRemoved?: (fileId: string) => void;
  onFileStarred?: (fileId: string, starred: boolean) => void;
}

export function SourceFileList({
  projectId,
  folderId,
  className,
  onFileLinked,
  onFileRemoved,
  onFileStarred,
}: SourceFileListProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Format file size
  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "--";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Format date
  const formatDate = (date: Date | null): string => {
    if (!date) return "--";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  // Fetch folder contents with automatic retry and token refresh
  const fetchFolderContents = useCallback(
    async (retryCount = 0) => {
      setLoading(true);
      setError(null);

      try {
        const [authToken, googleToken] = await Promise.all([
          getAuthToken(),
          getGoogleToken(),
        ]);

        const response = await fetch(
          `/api/projects/${projectId}/documents/list-folder?folderId=${folderId}`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "X-Google-Token": googleToken,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));

          // If 401 and we haven't retried yet, try to refresh tokens and retry
          if (response.status === 401 && retryCount === 0) {
            console.log("Authentication failed, attempting token refresh...");
            try {
              await refreshTokensAndRetry();
              return;
            } catch (refreshError) {
              console.error("Token refresh failed:", refreshError);
              throw new Error(
                "Authentication failed. Please sign out and sign in again."
              );
            }
          } else if (response.status === 401) {
            throw new Error(
              "Authentication failed. Please sign out and sign in again."
            );
          } else if (response.status === 404) {
            throw new Error("Project not found or access denied.");
          } else if (response.status === 400) {
            throw new Error(
              errorData.error ||
                "Failed to access Google Drive. Please check permissions."
            );
          } else {
            throw new Error(errorData.error || "Failed to fetch file contents");
          }
        }

        const data = await response.json().catch(() => {
          throw new Error("Invalid response format from server");
        });
        setFiles(data.files || []);
      } catch (err) {
        console.error("Error fetching folder contents:", err);
        let errorMessage = "Failed to load files";

        if (err instanceof Error) {
          if (err.message.includes("Authentication failed")) {
            errorMessage =
              "Authentication failed. Please sign out and sign in again.";
          } else if (
            err.message.includes("not found") ||
            err.message.includes("access denied")
          ) {
            errorMessage = "Project not found or access denied.";
          } else if (
            err.message.includes("Google Drive") ||
            err.message.includes("permissions")
          ) {
            errorMessage =
              "Failed to access Google Drive. Please check your permissions and try again.";
          } else if (err.message.includes("No Google Drive access token")) {
            errorMessage =
              "Google Drive access token is missing. Please sign out and sign in again.";
          } else {
            errorMessage = err.message;
          }
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }

      // Helper function to refresh tokens and retry
      async function refreshTokensAndRetry() {
        // Clear existing tokens to force refresh
        await clearTokens();

        // Wait a moment for the token refresh to take effect
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Retry the request
        return fetchFolderContents(retryCount + 1);
      }
    },
    [projectId, folderId]
  );

  // Get Firebase ID token for API authorization
  const getAuthToken = async (): Promise<string> => {
    const { auth } = await import("@/lib/firebase/firebase");
    const user = auth.currentUser;

    if (!user) {
      throw new Error("No authenticated user found");
    }

    return await user.getIdToken();
  };

  // Get Google OAuth token for Drive API access
  const getGoogleToken = async (): Promise<string> => {
    try {
      const { getDriveAccessToken } = await import("@/lib/firebase/firebase");
      const token = await getDriveAccessToken();

      if (!token) {
        throw new Error(
          "No Google Drive access token available. Please sign out and sign in again."
        );
      }

      return token;
    } catch (error) {
      console.error("Error getting Google token:", error);
      throw new Error(
        "Failed to get Google Drive access token. Please sign out and sign in again."
      );
    }
  };

  // Clear stored tokens to force refresh
  const clearTokens = async (): Promise<void> => {
    try {
      // Clear tokens from sessionStorage if available
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("google_access_token");
        sessionStorage.removeItem("google_refresh_token");
      }

      // Force re-authentication by clearing Firebase auth cache
      const { auth } = await import("@/lib/firebase/firebase");
      const user = auth.currentUser;
      if (user) {
        // Force token refresh by invalidating current token
        await user.getIdToken(true);
      }
    } catch (error) {
      console.error("Error clearing tokens:", error);
    }
  };

  // Handle file selection
  const handleFileSelect = (fileId: string, checked: boolean) => {
    if (checked) {
      setSelectedFiles((prev) => [...prev, fileId]);
    } else {
      setSelectedFiles((prev) => prev.filter((id) => id !== fileId));
    }
  };

  // Handle select all/deselect all
  const handleSelectAll = () => {
    const selectableFiles = files
      .filter((f) => f.isLinkedToProject)
      .map((f) => f.id);
    setSelectedFiles(selectableFiles);
  };

  const handleDeselectAll = () => {
    setSelectedFiles([]);
  };

  // Toggle select mode
  const handleToggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedFiles([]);
  };

  // Star selected files
  const handleStarSelected = async () => {
    setActionLoading("star");
    try {
      const documentIds = selectedFiles
        .map((fileId) => files.find((f) => f.id === fileId)?.documentId)
        .filter(Boolean);

      const [authToken, googleToken] = await Promise.all([
        getAuthToken(),
        getGoogleToken(),
      ]);

      const response = await fetch(
        `/api/projects/${projectId}/documents/star`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Google-Token": googleToken,
          },
          body: JSON.stringify({ documentIds }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to star files");
      }

      // Update local state
      setFiles((prev) =>
        prev.map((file) =>
          selectedFiles.includes(file.id) ? { ...file, isStarred: true } : file
        )
      );

      setSelectedFiles([]);
      setIsSelectMode(false);

      // Notify parent
      selectedFiles.forEach((fileId) => {
        onFileStarred?.(fileId, true);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to star files");
    } finally {
      setActionLoading(null);
    }
  };

  // Remove selected files from project
  const handleDeleteSelected = async () => {
    setActionLoading("delete");
    try {
      const documentIds = selectedFiles
        .map((fileId) => files.find((f) => f.id === fileId)?.documentId)
        .filter(Boolean);

      const [authToken, googleToken] = await Promise.all([
        getAuthToken(),
        getGoogleToken(),
      ]);

      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Google-Token": googleToken,
        },
        body: JSON.stringify({ documentIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove files");
      }

      // Update local state
      setFiles((prev) =>
        prev.map((file) =>
          selectedFiles.includes(file.id)
            ? {
                ...file,
                isLinkedToProject: false,
                isStarred: false,
                documentId: null,
              }
            : file
        )
      );

      setSelectedFiles([]);
      setIsSelectMode(false);
      setShowDeleteDialog(false);

      // Notify parent
      selectedFiles.forEach((fileId) => {
        onFileRemoved?.(fileId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove files");
    } finally {
      setActionLoading(null);
    }
  };

  // Link individual file to project with retry logic
  const handleLinkFile = async (fileId: string, retryCount = 0) => {
    setActionLoading(`link-${fileId}`);
    try {
      const [authToken, googleToken] = await Promise.all([
        getAuthToken(),
        getGoogleToken(),
      ]);

      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Google-Token": googleToken,
        },
        body: JSON.stringify({ driveFileId: fileId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));

        // Retry on 401 if we haven't already
        if (response.status === 401 && retryCount === 0) {
          console.log(
            "Authentication failed during link, attempting token refresh..."
          );
          await clearTokens();
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return handleLinkFile(fileId, retryCount + 1);
        }

        throw new Error(errorData.error || "Failed to link file");
      }

      const result = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });

      // Update local state
      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? {
                ...file,
                isLinkedToProject: true,
                documentId: result.document?.id || null,
              }
            : file
        )
      );

      // Notify parent
      onFileLinked?.(fileId);
    } catch (err) {
      console.error("Error linking file:", err);
      let errorMessage = "Failed to link file";

      if (err instanceof Error) {
        if (
          err.message.includes("Authentication failed") ||
          err.message.includes("token")
        ) {
          errorMessage =
            "Authentication failed. Please sign out and sign in again.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
    } finally {
      setActionLoading(null);
    }
  };

  // Unlink individual file from project
  const handleUnlinkFile = async (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file?.documentId) return;

    setActionLoading(`unlink-${fileId}`);
    try {
      const [authToken, googleToken] = await Promise.all([
        getAuthToken(),
        getGoogleToken(),
      ]);

      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Google-Token": googleToken,
        },
        body: JSON.stringify({ documentIds: [file.documentId] }),
      });

      if (!response.ok) {
        throw new Error("Failed to unlink file");
      }

      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                isLinkedToProject: false,
                isStarred: false,
                documentId: null,
              }
            : f
        )
      );

      // Notify parent
      onFileRemoved?.(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink file");
    } finally {
      setActionLoading(null);
    }
  };

  // Load folder contents on mount
  useEffect(() => {
    if (folderId) {
      fetchFolderContents();
    }
  }, [folderId, fetchFolderContents]);

  const linkedFiles = files.filter((f) => f.isLinkedToProject);
  const availableFiles = files.filter((f) => !f.isLinkedToProject);
  const allFiles = files; // Show all files instead of just linked ones
  const selectedCount = selectedFiles.length;

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-20" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-8 w-8" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertTriangle size={16} />
            <AlertDescription className="space-y-3">
              <div>{error}</div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchFolderContents}
                >
                  <RefreshCw size={14} className="mr-1" />
                  Retry
                </Button>
                {error.includes("sign out") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Redirect to sign out
                      window.location.href = "/";
                    }}
                  >
                    Sign Out
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Folder Contents</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="default">{linkedFiles.length} linked</Badge>
              {availableFiles.length > 0 && (
                <Badge variant="secondary">
                  {availableFiles.length} available
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchFolderContents}
                disabled={loading}
                aria-label="Refresh folder contents"
              >
                <RefreshCw
                  size={16}
                  className={cn(loading && "animate-spin")}
                />
              </Button>
            </div>
          </div>

          <SourceActionToolbar
            isSelectMode={isSelectMode}
            selectedFiles={selectedFiles}
            totalFiles={allFiles.length}
            onToggleSelectMode={handleToggleSelectMode}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onStarSelected={handleStarSelected}
            onDeleteSelected={() => setShowDeleteDialog(true)}
            disabled={actionLoading !== null}
          />
        </CardHeader>

        <CardContent>
          {files.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No files found in this folder</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Mobile view */}
              <div className="block md:hidden space-y-2">
                {allFiles.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      "border rounded-md p-3 transition-colors",
                      isSelectMode &&
                        selectedFiles.includes(file.id) &&
                        "bg-blue-50 border-blue-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {isSelectMode && file.isLinkedToProject && (
                        <Checkbox
                          checked={selectedFiles.includes(file.id)}
                          onCheckedChange={(checked) =>
                            handleFileSelect(file.id, checked as boolean)
                          }
                          aria-label={`Select ${file.name}`}
                        />
                      )}

                      <FileTypeIcon
                        mimeType={file.mimeType}
                        fileName={file.name}
                        size={24}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">
                            {file.name}
                          </p>
                          {file.isLinkedToProject ? (
                            <Badge
                              variant="default"
                              className="text-xs px-1 py-0"
                            >
                              Linked
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-xs px-1 py-0"
                            >
                              Available
                            </Badge>
                          )}
                          {file.isStarred && (
                            <Star
                              size={14}
                              className="text-yellow-500 fill-current flex-shrink-0"
                            />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <p>{getFileTypeName(file.mimeType)}</p>
                          <p>
                            {formatFileSize(file.fileSize)} •{" "}
                            {formatDate(file.lastModified)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {file.isLinkedToProject ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnlinkFile(file.id)}
                            disabled={actionLoading === `unlink-${file.id}`}
                            aria-label={`Unlink ${file.name} from project`}
                          >
                            <Link2Off size={14} />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleLinkFile(file.id)}
                            disabled={actionLoading === `link-${file.id}`}
                            aria-label={`Link ${file.name} to project`}
                          >
                            <Plus size={14} />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${file.name} in Google Drive`}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isSelectMode && <TableHead className="w-12"></TableHead>}
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-32">Type</TableHead>
                      <TableHead className="w-24">Size</TableHead>
                      <TableHead className="w-40">Modified</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allFiles.map((file) => (
                      <TableRow
                        key={file.id}
                        className={cn(
                          isSelectMode &&
                            selectedFiles.includes(file.id) &&
                            "bg-blue-50"
                        )}
                      >
                        {isSelectMode && file.isLinkedToProject && (
                          <TableCell>
                            <Checkbox
                              checked={selectedFiles.includes(file.id)}
                              onCheckedChange={(checked) =>
                                handleFileSelect(file.id, checked as boolean)
                              }
                              aria-label={`Select ${file.name}`}
                            />
                          </TableCell>
                        )}
                        {isSelectMode && !file.isLinkedToProject && (
                          <TableCell>
                            {/* Empty cell for non-linked files to maintain alignment */}
                          </TableCell>
                        )}

                        <TableCell>
                          <FileTypeIcon
                            mimeType={file.mimeType}
                            fileName={file.name}
                          />
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium">
                              {file.name}
                            </span>
                            {file.isLinkedToProject ? (
                              <Badge
                                variant="default"
                                className="text-xs px-1 py-0"
                              >
                                Linked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs px-1 py-0"
                              >
                                Available
                              </Badge>
                            )}
                            {file.isStarred && (
                              <Star
                                size={14}
                                className="text-yellow-500 fill-current flex-shrink-0"
                              />
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-sm text-gray-600">
                          {getFileTypeName(file.mimeType)}
                        </TableCell>

                        <TableCell className="text-sm text-gray-600">
                          {formatFileSize(file.fileSize)}
                        </TableCell>

                        <TableCell className="text-sm text-gray-600">
                          {formatDate(file.lastModified)}
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1">
                            {file.isLinkedToProject ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnlinkFile(file.id)}
                                disabled={actionLoading === `unlink-${file.id}`}
                                aria-label={`Unlink ${file.name} from project`}
                              >
                                <Link2Off size={14} />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLinkFile(file.id)}
                                disabled={actionLoading === `link-${file.id}`}
                                aria-label={`Link ${file.name} to project`}
                              >
                                <Plus size={14} />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Open ${file.name} in Google Drive`}
                              >
                                <ExternalLink size={14} />
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Files from Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {selectedCount}{" "}
              {selectedCount === 1 ? "file" : "files"} from this project?
              <br />
              <strong>
                The files will remain in your Google Drive and won't be deleted.
              </strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={actionLoading === "delete"}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={actionLoading === "delete"}
            >
              {actionLoading === "delete"
                ? "Removing..."
                : "Remove from Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
