'use client';

import { CheckCircle, XCircle, AlertTriangle, Clock, FileText, Shield, Users, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatusItem {
  id: string;
  title: string;
  status: 'completed' | 'failed' | 'warning' | 'pending';
  category: 'document' | 'process' | 'compliance' | 'system';
  description?: string;
  lastUpdated?: string;
}

interface StatusIconsGridProps {
  data: StatusItem[];
  title?: string;
  columns?: number;
}

const statusConfig = {
  completed: {
    icon: CheckCircle,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20'
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20'
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20'
  },
  pending: {
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20'
  }
};

const categoryConfig = {
  document: {
    icon: FileText,
    label: 'Document'
  },
  process: {
    icon: Settings,
    label: 'Process'
  },
  compliance: {
    icon: Shield,
    label: 'Compliance'
  },
  system: {
    icon: Users,
    label: 'System'
  }
};

export function StatusIconsGrid({
  data,
  title = "Process & Document Status",
  columns = 3
}: StatusIconsGridProps) {
  const getStatusCount = (status: keyof typeof statusConfig) => {
    return data.filter(item => item.status === status).length;
  };

  return (
    <Card className="enterprise-card">
      <CardHeader>
        <CardTitle className="text-enterprise-text-primary">{title}</CardTitle>

        {/* Summary Stats */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-enterprise-text-secondary">{getStatusCount('completed')} Complete</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span className="text-enterprise-text-secondary">{getStatusCount('warning')} Warning</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-enterprise-text-secondary">{getStatusCount('failed')} Failed</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-enterprise-text-secondary">{getStatusCount('pending')} Pending</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {data.map((item) => {
            const StatusIcon = statusConfig[item.status].icon;
            const CategoryIcon = categoryConfig[item.category].icon;
            const statusStyle = statusConfig[item.status];

            return (
              <div
                key={item.id}
                className={cn(
                  "relative p-4 rounded-lg border transition-all duration-200 hover:shadow-sm",
                  statusStyle.bgColor,
                  statusStyle.borderColor,
                  "hover:border-enterprise-border-primary"
                )}
              >
                {/* Status indicator */}
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("p-1 rounded-full", statusStyle.bgColor)}>
                    <StatusIcon className={cn("h-4 w-4", statusStyle.color)} />
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-enterprise-text-primary">
                    {item.title}
                  </h4>

                  {item.description && (
                    <p className="text-xs text-enterprise-text-secondary line-clamp-2">
                      {item.description}
                    </p>
                  )}

                </div>

                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  <div className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                    item.status === 'completed' && "bg-green-500/20 text-green-700",
                    item.status === 'failed' && "bg-red-500/20 text-red-700",
                    item.status === 'warning' && "bg-yellow-500/20 text-yellow-700",
                    item.status === 'pending' && "bg-blue-500/20 text-blue-700"
                  )}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {data.length === 0 && (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-enterprise-text-tertiary mx-auto mb-3" />
            <p className="text-enterprise-text-secondary">No status items to display</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}