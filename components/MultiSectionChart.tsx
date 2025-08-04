
import React from 'react';
import type { Section, DataPoint } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PROXY_LABELS } from '../constants';

interface MultiSectionChartProps {
  sections: Section[];
  spliceData: DataPoint[];
  proxyKey: string;
  xAxisKey: 'depth' | 'age';
  showLr04: boolean;
  lr04Data: { age: number; d18O: number }[];
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#00C49F', '#FFBB28'];

const MultiSectionChart: React.FC<MultiSectionChartProps> = ({ sections, spliceData, proxyKey, xAxisKey, showLr04, lr04Data }) => {

  // Prepare data for charting by sorting and ensuring it's valid
  const processedSections = sections.map(section => ({
    ...section,
    dataPoints: [...section.dataPoints]
      .filter(dp => dp[xAxisKey] !== undefined && dp[proxyKey] !== undefined)
      .sort((a, b) => (a[xAxisKey] as number) - (b[xAxisKey] as number))
  }));

  const yAxisLabel = PROXY_LABELS[proxyKey] || proxyKey;
  const xAxisLabel = xAxisKey === 'age' ? 'Age (ka)' : 'Depth (cmbsf)';

  return (
    <div style={{ width: '100%', height: 500 }}>
        <ResponsiveContainer>
            <LineChart margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                    dataKey={xAxisKey}
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fontSize: 12, fill: 'var(--recharts-axis-stroke)' }}
                    label={{ value: xAxisLabel, position: 'insideBottom', offset: -20, fontSize: 14 }}
                    allowDuplicatedCategory={false}
                    reversed={xAxisKey === 'age'}
                />
                <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 12, fill: 'var(--recharts-axis-stroke)' }}
                    domain={['auto', 'auto']}
                    label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fontSize: 14, dx: -10 }}
                />
                {showLr04 && xAxisKey === 'age' && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    reversed // d18O is typically plotted with enriched (colder) values downwards
                    tick={{ fontSize: 12, fill: 'var(--recharts-axis-stroke)' }}
                    domain={['dataMin - 0.2', 'dataMax + 0.2']}
                    label={{ value: "LR04 δ¹⁸O (‰)", angle: 90, position: 'insideRight', fontSize: 14, dx: 10 }}
                  />
                )}
                <Tooltip
                    formatter={(value: any, name: any) => [typeof value === 'number' ? value.toFixed(3) : value, PROXY_LABELS[name] || name]}
                    labelFormatter={(label) => `${xAxisLabel}: ${Number(label).toFixed(3)}`}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />

                {/* Render line for each section */}
                {processedSections.map((section, index) => (
                    <Line
                        key={section.id}
                        yAxisId="left"
                        dataKey={proxyKey}
                        data={section.dataPoints}
                        name={section.name}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        type="monotone"
                    />
                ))}

                {/* Render the composite splice line */}
                {spliceData.length > 0 && (
                     <Line
                        key="composite-splice"
                        yAxisId="left"
                        dataKey={proxyKey}
                        data={spliceData}
                        name="Composite Splice"
                        stroke="var(--accent-primary)"
                        strokeWidth={3}
                        dot={false}
                        connectNulls
                        type="monotone"
                    />
                )}

                {/* Render LR04 stack */}
                {showLr04 && xAxisKey === 'age' && (
                    <Line
                        key="lr04-stack"
                        yAxisId="right"
                        dataKey="d18O"
                        data={lr04Data}
                        name="LR04 Benthic Stack"
                        stroke="var(--text-muted)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        connectNulls
                        type="monotone"
                    />
                )}
            </LineChart>
        </ResponsiveContainer>
    </div>
  );
};

export default MultiSectionChart;
