'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RiskData {
  category: string;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
  totalRisks: number;
}

interface RiskPriorityChartProps {
  data: RiskData[];
  title?: string;
}

export function RiskPriorityChart({
  data,
  title = "Risk Priority Levels by Category"
}: RiskPriorityChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, item: any) => sum + item.value, 0);
      return (
        <div className="enterprise-glass rounded-lg p-3 border border-enterprise-border-primary">
          <p className="text-sm font-medium text-enterprise-text-primary mb-2">
            {label}
          </p>
          {payload.map((item: any, index: number) => (
            <div key={index} className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-enterprise-text-secondary">
                  {item.dataKey === 'highRisk' ? 'High Risk' :
                   item.dataKey === 'mediumRisk' ? 'Medium Risk' : 'Low Risk'}
                </span>
              </div>
              <span className="text-enterprise-text-primary font-medium">
                {item.value}
              </span>
            </div>
          ))}
          <div className="border-t border-enterprise-border-primary pt-1 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-enterprise-text-secondary">Total:</span>
              <span className="text-enterprise-text-primary font-medium">{total}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="enterprise-card">
      <CardHeader>
        <CardTitle className="text-enterprise-text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            layout="horizontal"
            margin={{
              top: 20,
              right: 30,
              left: 80,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--enterprise-border-primary) / 0.3)" />
            <XAxis
              type="number"
              tick={{ fill: 'rgb(var(--enterprise-text-secondary))', fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="category"
              tick={{ fill: 'rgb(var(--enterprise-text-secondary))', fontSize: 12 }}
              width={75}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="highRisk"
              stackId="a"
              fill="#ef4444"
              name="High Risk"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="mediumRisk"
              stackId="a"
              fill="#f59e0b"
              name="Medium Risk"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="lowRisk"
              stackId="a"
              fill="#10b981"
              name="Low Risk"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span className="text-sm text-enterprise-text-secondary">High Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span className="text-sm text-enterprise-text-secondary">Medium Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span className="text-sm text-enterprise-text-secondary">Low Risk</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}