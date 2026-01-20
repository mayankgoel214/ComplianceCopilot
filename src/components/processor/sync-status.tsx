'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff
} from 'lucide-react';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

interface SyncStatusProps {
  status: SyncStatus;
  lastSyncTime?: Date;
  onRefresh?: () => void;
  errorMessage?: string;
  className?: string;
}

export function SyncStatus({
  status,
  lastSyncTime,
  onRefresh,
  errorMessage,
  className = ''
}: SyncStatusProps) {
  const getStatusConfig = (status: SyncStatus) => {
    switch (status) {
      case 'syncing':
        return {
          icon: <RefreshCw size={14} className="animate-spin" />,
          label: 'Syncing...',
          variant: 'secondary' as const,
          color: 'text-blue-600'
        };
      case 'success':
        return {
          icon: <CheckCircle size={14} />,
          label: 'Synced',
          variant: 'default' as const,
          color: 'text-green-600'
        };
      case 'error':
        return {
          icon: <AlertTriangle size={14} />,
          label: 'Sync failed',
          variant: 'destructive' as const,
          color: 'text-red-600'
        };
      case 'offline':
        return {
          icon: <WifiOff size={14} />,
          label: 'Offline',
          variant: 'outline' as const,
          color: 'text-gray-600'
        };
      case 'idle':
      default:
        return {
          icon: <Clock size={14} />,
          label: 'Ready',
          variant: 'outline' as const,
          color: 'text-gray-600'
        };
    }
  };

  const config = getStatusConfig(status);

  const formatLastSyncTime = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={config.variant} className="flex items-center gap-1">
          {config.icon}
          {config.label}
        </Badge>

        {lastSyncTime && status !== 'syncing' && (
          <span className="text-xs text-gray-500">
            {formatLastSyncTime(lastSyncTime)}
          </span>
        )}

        {onRefresh && status !== 'syncing' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            className="h-6 px-2"
          >
            <RefreshCw size={12} />
          </Button>
        )}
      </div>

      {/* Error Message */}
      {status === 'error' && errorMessage && (
        <Alert variant="destructive" className="text-sm">
          <AlertTriangle size={14} />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Offline Message */}
      {status === 'offline' && (
        <Alert variant="destructive" className="text-sm">
          <WifiOff size={14} />
          <AlertDescription>
            No internet connection. Changes will sync when you're back online.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Compact version for table cells or small spaces
interface CompactSyncStatusProps {
  status: SyncStatus;
  onRefresh?: () => void;
  className?: string;
}

export function CompactSyncStatus({
  status,
  onRefresh,
  className = ''
}: CompactSyncStatusProps) {
  const getStatusConfig = (status: SyncStatus) => {
    switch (status) {
      case 'syncing':
        return {
          icon: <RefreshCw size={12} className="animate-spin text-blue-500" />,
          title: 'Syncing...'
        };
      case 'success':
        return {
          icon: <CheckCircle size={12} className="text-green-500" />,
          title: 'Synced'
        };
      case 'error':
        return {
          icon: <AlertTriangle size={12} className="text-red-500" />,
          title: 'Sync failed'
        };
      case 'offline':
        return {
          icon: <WifiOff size={12} className="text-gray-500" />,
          title: 'Offline'
        };
      case 'idle':
      default:
        return {
          icon: <Clock size={12} className="text-gray-400" />,
          title: 'Ready'
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div title={config.title}>
        {config.icon}
      </div>
      {onRefresh && status !== 'syncing' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-5 w-5 p-0 hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw size={10} />
        </Button>
      )}
    </div>
  );
}