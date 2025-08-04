import React from 'react';
import type { DataPoint, LabAnalysis } from '../types';
import { Table } from 'lucide-react';
import { PROXY_LABELS } from '../constants';

interface DataTableProps {
  data: DataPoint[];
  averages?: LabAnalysis | null;
}

const DataTable: React.FC<DataTableProps> = ({ data, averages }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-background-tertiary/20 rounded-lg text-content-muted border-2 border-dashed border-border-primary">
        <Table size={40} className="mb-2" />
        <p className="font-semibold">No data series to display.</p>
        <p className="text-sm">Upload a CSV or add points manually in the 'Data Entry' tab.</p>
      </div>
    );
  }

  const allHeaders = Object.keys(data[0] || {});
  let headers: string[];
  const subsectionIndex = allHeaders.findIndex(h => h.toLowerCase() === 'subsection');

  if (subsectionIndex > -1) {
    const subsectionHeader = allHeaders[subsectionIndex];
    headers = [subsectionHeader, ...allHeaders.filter(h => h !== subsectionHeader)];
  } else {
    headers = allHeaders;
  }

  const getAverage = (header: string): string | null => {
    if (!averages) return null;
    // The key in DataPoint might not exist in LabAnalysis if it's not a standard proxy
    if (!(header in averages)) return null;
    const averageValue = averages[header as keyof LabAnalysis];
    if (typeof averageValue === 'number') {
        return averageValue.toFixed(4);
    }
    return null;
  };
  
  const hasAverages = averages && Object.values(averages).some(val => val !== null && val !== undefined);

  return (
    <div className="max-h-96 overflow-y-auto pr-2 relative">
      <table className="w-full text-sm text-left text-content-secondary">
        <thead className="text-xs text-content-muted uppercase bg-background-tertiary sticky top-0 z-10">
          <tr>
            {headers.map(header => (
              <th key={header} scope="col" className="px-6 py-3 whitespace-nowrap font-semibold">
                {PROXY_LABELS[header] || header.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-primary">
          {data.map((dp, index) => (
            <tr key={dp.subsection || index} className="bg-background-secondary hover:bg-background-tertiary/60">
              {headers.map(header => (
                <td key={header} className="px-6 py-3 font-mono">
                  {dp[header] === null || dp[header] === undefined ? '-' : typeof dp[header] === 'number' ? (dp[header] as number).toFixed(4) : String(dp[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasAverages && (
            <tfoot className="sticky bottom-0 z-10">
              <tr className="bg-background-primary/80 backdrop-blur-sm border-t-2 border-accent-primary shadow-lg">
                {headers.map(header => (
                  <td key={`avg-${header}`} className="px-6 py-3 font-mono font-bold text-accent-primary whitespace-nowrap">
                    {header.toLowerCase() === 'subsection' ? (
                        <span className="text-content-primary font-bold uppercase text-xs">Average</span>
                    ) : (
                        getAverage(header) || '—'
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
        )}
      </table>
    </div>
  );
};

export default DataTable;