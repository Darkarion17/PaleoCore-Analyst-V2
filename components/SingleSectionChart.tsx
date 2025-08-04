import React from 'react';
import type { DataPoint, PaleoEvent } from '../types';
import { PROXY_LABELS } from '../constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, Label } from 'recharts';

interface SingleSectionChartProps {
  data: DataPoint[];
  xAxisKey: 'depth' | 'age';
  yAxisKey: string;
  events?: PaleoEvent[];
}

const SingleSectionChart: React.FC<SingleSectionChartProps> = ({ data, xAxisKey, yAxisKey, events = [] }) => {
  const chartData = [...data]
    .filter(dp => dp[xAxisKey] !== undefined && dp[yAxisKey] !== undefined && dp[xAxisKey] !== null && dp[yAxisKey] !== null)
    .sort((a, b) => (a[xAxisKey] as number) - (b[xAxisKey] as number));
  
  if (chartData.length === 0) {
    return (
        <div className="flex items-center justify-center h-80 text-content-muted">
            <p>No valid data for the selected proxy '{PROXY_LABELS[yAxisKey] || yAxisKey}' to display.</p>
        </div>
    );
  }

  const yAxisLabel = PROXY_LABELS[yAxisKey] || yAxisKey;
  const xAxisLabel = xAxisKey === 'age' ? 'Age (ka)' : 'Depth (cmbsf)';

  return (
    <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer>
            <LineChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 40 }}
            >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                    dataKey={xAxisKey} 
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    reversed={xAxisKey === 'age'} // Palaeo charts often show age increasing to the left (0 on the right)
                    tick={{ fontSize: 12, fill: 'var(--recharts-axis-stroke)' }}
                    label={{ value: xAxisLabel, position: 'insideBottom', offset: -25, fontSize: 14, fill: 'var(--recharts-axis-stroke)' }}
                    allowDuplicatedCategory={false}
                />
                <YAxis
                    tick={{ fontSize: 12, fill: 'var(--recharts-axis-stroke)' }}
                    domain={['auto', 'auto']}
                    label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', fontSize: 14, fill: 'var(--recharts-axis-stroke)', dx: -10 }}
                />
                <Tooltip
                    formatter={(value: any, name: any) => [typeof value === 'number' ? value.toFixed(3) : value, PROXY_LABELS[name] || name]}
                    labelFormatter={(label) => `${xAxisLabel}: ${Number(label).toFixed(3)}`}
                    contentStyle={{ 
                        backgroundColor: 'var(--recharts-tooltip-bg)',
                        borderColor: 'var(--recharts-tooltip-border)',
                        color: 'var(--recharts-tooltip-text)'
                    }}
                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
                />
                <Legend wrapperStyle={{ paddingTop: '35px' }} />
                
                {xAxisKey === 'age' && events.map((event, index) => (
                    <ReferenceArea 
                        key={index} 
                        x1={event.endAge} // X-axis is reversed
                        x2={event.startAge} // X-axis is reversed
                        stroke="var(--event-annotation-stroke)"
                        fill="var(--event-annotation-fill)"
                        strokeOpacity={0.6}
                        fillOpacity={0.2}
                    >
                      <Label value={event.eventName} position="top" fill="var(--event-annotation-stroke)" fontSize={12} offset={10} />
                    </ReferenceArea>
                ))}

                <Line 
                    type="monotone" 
                    dataKey={yAxisKey} 
                    stroke="var(--accent-primary)" 
                    strokeWidth={2}
                    dot={false}
                    name={yAxisLabel}
                    connectNulls
                />
            </LineChart>
        </ResponsiveContainer>
    </div>
  );
};

export default SingleSectionChart;
