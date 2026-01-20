'use client';

import { useMemo } from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RadarDataPoint {
  framework: string;
  [category: string]: number | string;
}

interface FrameworkRadarChartProps {
  data: RadarDataPoint[];
  title?: string;
  height?: number;
  showLegend?: boolean;
  categories?: string[];
  colors?: string[];
}

const DEFAULT_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#84CC16', // Lime
];

export function FrameworkRadarChart({
  data,
  title = "Framework Comparison",
  height = 400,
  showLegend = true,
  categories,
  colors = DEFAULT_COLORS
}: FrameworkRadarChartProps) {
  const { processedData, detectedCategories, frameworks } = useMemo(() => {
    if (!data || data.length === 0) {
      return { processedData: [], detectedCategories: [], frameworks: [] };
    }

    // Extract all unique categories (excluding 'framework' field)
    const allCategories = new Set<string>();
    data.forEach(item => {
      Object.keys(item).forEach(key => {
        if (key !== 'framework') {
          allCategories.add(key);
        }
      });
    });

    const detectedCategories = categories || Array.from(allCategories);
    const frameworks = data.map(d => d.framework as string);

    // Transform data for radar chart
    const processedData = detectedCategories.map(category => {
      const point: any = { category };
      data.forEach((item, index) => {
        point[item.framework as string] = item[category] || 0;
      });
      return point;
    });

    return { processedData, detectedCategories, frameworks };
  }, [data, categories]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-semibold text-gray-900 mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-700">
              {entry.dataKey}: {entry.value}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <Card className="enterprise-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-enterprise-text-primary">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-enterprise-text-secondary">No framework data available</div>
            <div className="text-sm text-enterprise-text-tertiary mt-1">
              Run analysis to see framework comparisons
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
          Comparing {frameworks.length} framework{frameworks.length !== 1 ? 's' : ''} across {detectedCategories.length} categories
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={processedData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              <PolarGrid stroke="#E5E7EB" />
              <PolarAngleAxis
                dataKey="category"
                tick={{ fill: '#6B7280', fontSize: 12 }}
                className="text-xs"
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: '#6B7280', fontSize: 10 }}
                tickCount={5}
              />

              {frameworks.map((framework, index) => (
                <Radar
                  key={framework}
                  name={framework}
                  dataKey={framework}
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.1}
                  strokeWidth={2}
                  dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 4 }}
                />
              ))}

              <Tooltip content={<CustomTooltip />} />

              {showLegend && (
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="circle"
                />
              )}
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Category breakdown */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
          {detectedCategories.map(category => {
            const avgScore = Math.round(
              frameworks.reduce((sum, framework) => {
                const dataPoint = data.find(d => d.framework === framework);
                return sum + ((dataPoint?.[category] as number) || 0);
              }, 0) / frameworks.length
            );

            return (
              <div key={category} className="text-center p-2 bg-enterprise-surface-elevated rounded-lg">
                <div className="text-xs text-enterprise-text-secondary font-medium">
                  {category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </div>
                <div className="text-sm font-semibold text-enterprise-text-primary mt-1">
                  {avgScore}% avg
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}