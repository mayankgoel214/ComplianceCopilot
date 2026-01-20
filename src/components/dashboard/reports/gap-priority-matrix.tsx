'use client';

import { useMemo, useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComplianceGap } from '@/lib/types/report-types';

interface GapPriorityMatrixProps {
  gaps: ComplianceGap[];
  title?: string;
  height?: number;
  onGapClick?: (gap: ComplianceGap) => void;
  showQuadrantLabels?: boolean;
}

interface MatrixDataPoint {
  x: number; // effort
  y: number; // impact
  size: number;
  gap: ComplianceGap;
  color: string;
  name: string;
}

export function GapPriorityMatrix({
  gaps,
  title = "Gap Priority Matrix",
  height = 400,
  onGapClick,
  showQuadrantLabels = true
}: GapPriorityMatrixProps) {
  const [hoveredGap, setHoveredGap] = useState<string | null>(null);

  const { matrixData, severityStats } = useMemo(() => {
    if (!gaps || gaps.length === 0) {
      return { matrixData: [], severityStats: { critical: 0, high: 0, medium: 0, low: 0 } };
    }

    const matrixData: MatrixDataPoint[] = gaps.map(gap => ({
      x: mapEffortToNumber(gap.effort),
      y: gap.impact || 50,
      size: mapSeverityToSize(gap.severity),
      gap,
      color: getSeverityColor(gap.severity),
      name: gap.requirement || gap.description
    }));

    const severityStats = gaps.reduce((stats, gap) => {
      stats[gap.severity] = (stats[gap.severity] || 0) + 1;
      return stats;
    }, { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>);

    return { matrixData, severityStats };
  }, [gaps]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload as MatrixDataPoint;
    const gap = data.gap;

    return (
      <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-sm">
        <div className="font-semibold text-gray-900 mb-2 line-clamp-2">
          {gap.requirement || gap.description}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Framework:</span>
            <span className="font-medium">{gap.framework}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Category:</span>
            <span className="font-medium">{gap.category}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Severity:</span>
            <span className={`font-medium capitalize ${getSeverityTextClass(gap.severity)}`}>
              {gap.severity}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Impact:</span>
            <span className="font-medium">{gap.impact}%</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Effort:</span>
            <span className="font-medium capitalize">{gap.effort}</span>
          </div>

          {gap.estimatedHours && (
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Hours:</span>
              <span className="font-medium">{gap.estimatedHours}h</span>
            </div>
          )}
        </div>

        {onGapClick && (
          <div className="mt-3 text-xs text-blue-600">
            Click to view details
          </div>
        )}
      </div>
    );
  };

  const handleDotClick = (data: MatrixDataPoint) => {
    if (onGapClick) {
      onGapClick(data.gap);
    }
  };

  if (!gaps || gaps.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">No compliance gaps found</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Great! Your project appears to be compliant
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="enterprise-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
          {title}
        </CardTitle>
        <div className="text-sm text-enterprise-text-secondary">
          {gaps.length} compliance gap{gaps.length !== 1 ? 's' : ''} plotted by impact vs effort
        </div>
      </CardHeader>
      <CardContent>
        {/* Severity legend */}
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          {Object.entries(severityStats).map(([severity, count]) => (
            count > 0 && (
              <div key={severity} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getSeverityColor(severity) }}
                />
                <span className="text-sm text-enterprise-text-secondary">
                  {severity.charAt(0).toUpperCase() + severity.slice(1)} ({count})
                </span>
              </div>
            )
          ))}
        </div>

        <div style={{ height }} className="relative">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

              <XAxis
                type="number"
                dataKey="x"
                name="Effort"
                domain={[0, 100]}
                tickFormatter={(value) => getEffortLabel(value)}
                tick={{ fill: '#6B7280', fontSize: 12 }}
              />

              <YAxis
                type="number"
                dataKey="y"
                name="Impact"
                domain={[0, 100]}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                label={{ value: 'Impact (%)', angle: -90, position: 'insideLeft' }}
              />

              {/* Quadrant dividers */}
              <ReferenceLine x={50} stroke="#9CA3AF" strokeDasharray="5 5" />
              <ReferenceLine y={50} stroke="#9CA3AF" strokeDasharray="5 5" />

              <Tooltip content={<CustomTooltip />} />

              <Scatter
                data={matrixData}
                cursor={onGapClick ? 'pointer' : 'default'}
              >
                {matrixData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    fillOpacity={hoveredGap === entry.gap.id ? 0.8 : 0.6}
                    stroke={entry.color}
                    strokeWidth={hoveredGap === entry.gap.id ? 2 : 1}
                    onClick={() => handleDotClick(entry)}
                    onMouseEnter={() => setHoveredGap(entry.gap.id)}
                    onMouseLeave={() => setHoveredGap(null)}
                    r={entry.size}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Quadrant labels */}
          {showQuadrantLabels && (
            <>
              <div className="absolute top-6 left-6 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                High Impact<br />Low Effort<br /><strong>Quick Wins</strong>
              </div>
              <div className="absolute top-6 right-6 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                High Impact<br />High Effort<br /><strong>Major Projects</strong>
              </div>
              <div className="absolute bottom-12 left-6 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                Low Impact<br />Low Effort<br /><strong>Fill-ins</strong>
              </div>
              <div className="absolute bottom-12 right-6 text-xs text-gray-500 bg-white px-2 py-1 rounded shadow">
                Low Impact<br />High Effort<br /><strong>Questionable</strong>
              </div>
            </>
          )}
        </div>

        {/* Axis labels */}
        <div className="text-center mt-2">
          <div className="text-sm text-enterprise-text-secondary">
            Implementation Effort →
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function mapEffortToNumber(effort: string): number {
  switch (effort.toLowerCase()) {
    case 'low': return 25;
    case 'medium': return 50;
    case 'high': return 75;
    default: return 50;
  }
}

function getEffortLabel(value: number): string {
  if (value <= 33) return 'Low';
  if (value <= 66) return 'Med';
  return 'High';
}

function mapSeverityToSize(severity: string): number {
  switch (severity.toLowerCase()) {
    case 'critical': return 12;
    case 'high': return 10;
    case 'medium': return 8;
    case 'low': return 6;
    default: return 8;
  }
}

function getSeverityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical': return '#DC2626';
    case 'high': return '#EA580C';
    case 'medium': return '#CA8A04';
    case 'low': return '#16A34A';
    default: return '#6B7280';
  }
}

function getSeverityTextClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical': return 'text-red-600';
    case 'high': return 'text-orange-600';
    case 'medium': return 'text-yellow-600';
    case 'low': return 'text-green-600';
    default: return 'text-gray-600';
  }
}