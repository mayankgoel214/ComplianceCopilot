'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ComplianceData {
  framework: string;
  percentage: number;
  color: string;
}

interface ComplianceDonutChartProps {
  data: ComplianceData[];
  title?: string;
  centerText?: string;
  size?: number;
}

export function ComplianceDonutChart({
  data,
  title = "Compliance Completion",
  centerText = "Overall",
  size = 200
}: ComplianceDonutChartProps) {
  const overallPercentage = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((sum, item) => sum + item.percentage, 0) / data.length);
  }, [data]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="enterprise-glass rounded-lg p-3 border border-enterprise-border-primary">
          <p className="text-sm font-medium text-enterprise-text-primary">
            {data.framework}
          </p>
          <p className="text-xs text-enterprise-text-secondary">
            {data.percentage}% Complete
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    return (
      <div className="grid grid-cols-1 gap-2 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-enterprise-text-secondary truncate">
                {entry.payload.framework}
              </span>
            </div>
            <span className="text-enterprise-text-primary font-medium">
              {entry.payload.percentage}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="enterprise-card">
      <CardHeader>
        <CardTitle className="text-enterprise-text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ResponsiveContainer width="100%" height={size + 50}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={size * 0.25}
                outerRadius={size * 0.4}
                paddingAngle={2}
                dataKey="percentage"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-2xl font-bold text-enterprise-text-primary">
                {overallPercentage}%
              </div>
              <div className="text-sm text-enterprise-text-secondary">
                {centerText}
              </div>
            </div>
          </div>
        </div>

        {/* Custom Legend */}
        <CustomLegend payload={data.map(item => ({ ...item, payload: item }))} />
      </CardContent>
    </Card>
  );
}