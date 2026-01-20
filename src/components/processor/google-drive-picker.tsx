"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, FileText } from "lucide-react";
import { getDriveAccessToken } from "@/lib/firebase/firebase";

declare global {
  interface Window {
    google: {
      picker: {
        Action: { PICKED: string };
        Feature: { NAV_HIDDEN: string; MULTISELECT_ENABLED: string };
        ViewId: {
          DOCS: string;
          SPREADSHEETS: string;
          PRESENTATIONS: string;
          PDFS: string;
          FOLDERS: string;
        };
        PickerBuilder: new () => {
          enableFeature: (feature: string) => GooglePickerBuilder;
          setAppId: (appId: string) => GooglePickerBuilder;
          setOAuthToken: (token: string) => GooglePickerBuilder;
          addView: (viewId: string) => GooglePickerBuilder;
          setCallback: (
            callback: (data: GooglePickerResult) => void
          ) => GooglePickerBuilder;
          setOrigin: (origin: string) => GooglePickerBuilder;
          setSize: (width: number, height: number) => GooglePickerBuilder;
          build: () => GooglePicker;
        };
      };
    };
    gapi: {
      load: (apis: string, callback: () => void) => void;
    };
  }
}

interface GooglePickerBuilder {
  enableFeature: (feature: string) => GooglePickerBuilder;
  setAppId: (appId: string) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  addView: (viewId: string) => GooglePickerBuilder;
  setCallback: (
    callback: (data: GooglePickerResult) => void
  ) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  setSize: (width: number, height: number) => GooglePickerBuilder;
  build: () => GooglePicker;
}

interface GooglePicker {
  setVisible: (visible: boolean) => void;
}

interface GooglePickerResult {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

// Note: Google Picker can work with just OAuth tokens, no API key needed

interface GoogleDrivePickerProps {
  onSelectFile: (fileId: string) => Promise<void>;
  selectedFiles?: string[];
  disabled?: boolean;
  variant?: "button" | "link";
  preferFolders?: boolean;
  selectionMode?: "folders" | "files" | "both";
}

export function GoogleDrivePicker({
  onSelectFile,
  selectedFiles = [],
  disabled = false,
  variant = "button",
  preferFolders = false,
  selectionMode = "both",
}: Readonly<GoogleDrivePickerProps>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);

  // Load Google APIs on component mount
  useEffect(() => {
    const initializeGapi = () => {
      window.gapi.load("auth2:picker", () => {
        setIsGapiLoaded(true);
      });
    };

    const loadGoogleAPIs = () => {
      // Load GAPI
      if (!window.gapi) {
        const gapiScript = document.createElement("script");
        gapiScript.src = "https://apis.google.com/js/api.js";
        gapiScript.onload = initializeGapi;
        document.head.appendChild(gapiScript);
      } else {
        initializeGapi();
      }
    };

    loadGoogleAPIs();
  }, []);

  // Handle picker callback
  const pickerCallback = async (data: GooglePickerResult) => {
    if (
      data.action === window.google.picker.Action.PICKED &&
      data.docs &&
      data.docs.length > 0
    ) {
      try {
        setIsLoading(true);
        setError(null);

        // Process all selected files
        const selectedFileIds = data.docs.map((doc) => doc.id);
        const newFileIds = selectedFileIds.filter(
          (fileId) => !selectedFiles.includes(fileId)
        );

        if (newFileIds.length === 0) {
          setError("All selected files are already linked to the project");
          return;
        }

        // Process each new file
        for (const fileId of newFileIds) {
          try {
            await onSelectFile(fileId);
          } catch (error) {
            console.error(`Error processing file ${fileId}:`, error);
            // Continue processing other files even if one fails
          }
        }

        // Show success message
        if (newFileIds.length > 0) {
          console.log(`Successfully processed ${newFileIds.length} file(s)`);
        }
      } catch (error) {
        console.error("Error processing selected files:", error);
        setError("Failed to process some selected files. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Create and show the picker
  const showPicker = async () => {
    if (!isGapiLoaded) {
      setError("Google APIs are still loading. Please try again in a moment.");
      return;
    }

    try {
      setError(null);
      setIsLoading(true);

      // Get the OAuth access token
      const accessToken = await getDriveAccessToken();
      if (!accessToken) {
        throw new Error(
          "No Google Drive access token available. Please sign out and sign in again."
        );
      }

      // Create picker
      const pickerBuilder = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken);

      // Add views based on selection mode and preference
      if (
        selectionMode === "folders" ||
        (preferFolders && selectionMode === "both")
      ) {
        pickerBuilder.addView(window.google.picker.ViewId.FOLDERS);
        if (selectionMode === "both") {
          pickerBuilder.addView(window.google.picker.ViewId.DOCS);
          pickerBuilder.addView(window.google.picker.ViewId.PDFS);
          pickerBuilder.addView(window.google.picker.ViewId.SPREADSHEETS);
          pickerBuilder.addView(window.google.picker.ViewId.PRESENTATIONS);
        }
      } else if (selectionMode === "files") {
        pickerBuilder.addView(window.google.picker.ViewId.DOCS);
        pickerBuilder.addView(window.google.picker.ViewId.PDFS);
        pickerBuilder.addView(window.google.picker.ViewId.SPREADSHEETS);
        pickerBuilder.addView(window.google.picker.ViewId.PRESENTATIONS);
      } else {
        // 'both' mode - prioritize files but include folders
        pickerBuilder.addView(window.google.picker.ViewId.DOCS);
        pickerBuilder.addView(window.google.picker.ViewId.PDFS);
        pickerBuilder.addView(window.google.picker.ViewId.SPREADSHEETS);
        pickerBuilder.addView(window.google.picker.ViewId.PRESENTATIONS);
        pickerBuilder.addView(window.google.picker.ViewId.FOLDERS);
      }

      const picker = pickerBuilder
        .setCallback(pickerCallback)
        .setOrigin(window.location.protocol + "//" + window.location.host)
        .setSize(1051, 650)
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error("Error opening picker:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to open Google Drive picker"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return "Opening Google Drive...";
    if (!isGapiLoaded) return "Loading Google APIs...";

    if (selectionMode === "folders") return "Select Folder from Google Drive";
    if (selectionMode === "files") return "Select Files from Google Drive";
    if (preferFolders) return "Select Folder from Google Drive";
    return "Select from Google Drive";
  };

  const buttonText = getButtonText();

  if (variant === "link") {
    return (
      <div className="space-y-2">
        <button
          onClick={showPicker}
          disabled={disabled || isLoading || !isGapiLoaded}
          className="text-sm text-blue-600 hover:text-blue-700 underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {buttonText.replace("Select", "Upload")}
        </button>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={showPicker}
        disabled={disabled || isLoading || !isGapiLoaded}
        className="w-full"
      >
        <FileText className="mr-2 h-4 w-4" />
        {buttonText}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {selectedFiles.length > 0 && (
        <div className="text-sm text-gray-600">
          {selectedFiles.length} item{selectedFiles.length !== 1 ? "s" : ""}{" "}
          already linked
        </div>
      )}
    </div>
  );
}
