'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourceActionToolbarProps {
  isSelectMode: boolean;
  selectedFiles: string[];
  totalFiles: number;
  onToggleSelectMode: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onStarSelected: () => void;
  onDeleteSelected: () => void;
  className?: string;
  disabled?: boolean;
}

export function SourceActionToolbar({
  isSelectMode,
  selectedFiles,
  totalFiles,
  onToggleSelectMode,
  onSelectAll,
  onDeselectAll,
  onStarSelected,
  onDeleteSelected,
  className,
  disabled = false
}: SourceActionToolbarProps) {
  const selectedCount = selectedFiles.length;
  const allSelected = selectedCount === totalFiles && totalFiles > 0;

  if (!isSelectMode) {
    return (
      <div className={cn('flex items-center justify-between py-3', className)}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
          </span>
        </div>

        {totalFiles > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSelectMode}
            disabled={disabled}
            aria-label="Enter selection mode"
          >
            Select
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('bg-blue-50 border border-blue-200 rounded-md p-3 space-y-3', className)}>
      {/* Header with selection info and exit button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
            {selectedCount} selected
          </Badge>
          {selectedCount > 0 && (
            <span className="text-sm text-gray-600">
              of {totalFiles} {totalFiles === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSelectMode}
          disabled={disabled}
          aria-label="Exit selection mode"
        >
          <X size={16} />
          Done
        </Button>
      </div>

      {/* Selection controls and actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Selection controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            disabled={disabled || totalFiles === 0}
            aria-label={allSelected ? 'Deselect all files' : 'Select all files'}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>

        {/* Actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onStarSelected}
              disabled={disabled}
              aria-label={`Star ${selectedCount} selected files`}
            >
              <Star size={16} className="mr-1" />
              Star ({selectedCount})
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onDeleteSelected}
              disabled={disabled}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              aria-label={`Remove ${selectedCount} selected files from project`}
            >
              <Trash2 size={16} className="mr-1" />
              Remove ({selectedCount})
            </Button>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="text-xs text-gray-500">
        {selectedCount === 0 ? (
          'Select files to star them or remove them from this project'
        ) : (
          `${selectedCount} ${selectedCount === 1 ? 'file' : 'files'} selected. Files will only be removed from this project, not from Google Drive.`
        )}
      </div>
    </div>
  );
}