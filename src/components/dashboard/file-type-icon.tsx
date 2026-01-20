import {
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  Presentation,
  Folder,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTypeIconProps {
  mimeType: string;
  fileName?: string;
  size?: number;
  className?: string;
}

export function FileTypeIcon({
  mimeType,
  fileName = "",
  size = 20,
  className,
}: FileTypeIconProps) {
  const getIcon = () => {
    // Google Workspace files
    if (mimeType === "application/vnd.google-apps.document") {
      return <FileText size={size} className="text-blue-600" />;
    }
    if (mimeType === "application/vnd.google-apps.spreadsheet") {
      return <FileSpreadsheet size={size} className="text-green-600" />;
    }
    if (mimeType === "application/vnd.google-apps.presentation") {
      return <Presentation size={size} className="text-orange-600" />;
    }
    if (mimeType === "application/vnd.google-apps.folder") {
      return <Folder size={size} className="text-blue-500" />;
    }

    // Microsoft Office files
    if (
      mimeType.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml"
      ) ||
      mimeType.includes("application/msword")
    ) {
      return <FileText size={size} className="text-blue-600" />;
    }
    if (
      mimeType.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml"
      ) ||
      mimeType.includes("application/vnd.ms-excel")
    ) {
      return <FileSpreadsheet size={size} className="text-green-600" />;
    }
    if (
      mimeType.includes(
        "application/vnd.openxmlformats-officedocument.presentationml"
      ) ||
      mimeType.includes("application/vnd.ms-powerpoint")
    ) {
      return <Presentation size={size} className="text-orange-600" />;
    }

    // PDF files
    if (mimeType === "application/pdf") {
      return <FileText size={size} className="text-red-600" />;
    }

    // Image files
    if (mimeType.startsWith("image/")) {
      return <FileImage size={size} className="text-purple-600" />;
    }

    // Video files
    if (mimeType.startsWith("video/")) {
      return <FileVideo size={size} className="text-pink-600" />;
    }

    // Audio files
    if (mimeType.startsWith("audio/")) {
      return <FileAudio size={size} className="text-indigo-600" />;
    }

    // Archive files
    if (
      mimeType.includes("zip") ||
      mimeType.includes("rar") ||
      mimeType.includes("tar")
    ) {
      return <FileArchive size={size} className="text-yellow-600" />;
    }

    // Code files
    if (
      mimeType.startsWith("text/") ||
      fileName.match(/\.(js|ts|jsx|tsx|html|css|json|xml|yaml|yml|md)$/i)
    ) {
      return <FileCode size={size} className="text-gray-600" />;
    }

    // Folder type
    if (mimeType === "application/vnd.google-apps.folder") {
      return <Folder size={size} className="text-blue-500" />;
    }

    // Default file icon
    return <File size={size} className="text-gray-500" />;
  };

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      aria-label={`File type: ${mimeType}`}
    >
      {getIcon()}
    </div>
  );
}

export function getFileTypeName(mimeType: string): string {
  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return "Google Doc";
    case "application/vnd.google-apps.spreadsheet":
      return "Google Sheet";
    case "application/vnd.google-apps.presentation":
      return "Google Slides";
    case "application/vnd.google-apps.folder":
      return "Folder";
    case "application/pdf":
      return "PDF";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX Document";
    case "application/msword":
      return "DOC Document";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return "Excel Spreadsheet";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.ms-powerpoint":
      return "PowerPoint";
    default:
      if (mimeType.startsWith("image/")) return "Image";
      if (mimeType.startsWith("video/")) return "Video";
      if (mimeType.startsWith("audio/")) return "Audio";
      if (mimeType.startsWith("text/")) return "Text File";
      return "File";
  }
}
