
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Section, TiePoint, SpliceInterval, DataPoint } from '../types';
import AgeModelAssistant from './AgeModelAssistant';
import MultiSectionChart from './MultiSectionChart';
import { generateAgeModel } from '../services/geminiService';
import { Blend, Wand2, Loader2, AlertCircle, Camera, CheckCircle, XCircle, Globe } from 'lucide-react';
import html2canvas from 'html2canvas';
import { LR04_DATA } from '../data/lr04';

interface CoreSynthesisViewProps {
  sections: Section[];
  calibratedSections: Section[] | null;
  onCalibratedDataChange: (calibratedSections: Section[]) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' | 'info'; show: boolean }) => void;
  onCaptureChart: (chartData: { dataUrl: string; aspectRatio: number } | null) => void;
  isChartCaptured: boolean;
}


const CoreSynthesisView: React.FC<CoreSynthesisViewProps> = ({ sections, calibratedSections, onCalibratedDataChange, setToast, onCaptureChart, isChartCaptured }) => {
  const [tiePoints, setTiePoints] = useState<TiePoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProxy, setSelectedProxy] = useState<string>('delta18O');
  const chartRef = useRef<HTMLDivElement>(null);

  const [spliceIntervals, setSpliceIntervals] = useState<Record<string, SpliceInterval>>({});
  const [showLr04, setShowLr04] = useState(false);

  useEffect(() => {
    setSpliceIntervals(
      Object.fromEntries(sections.map(s => [s.id, { sectionId: s.id, startAge: null, endAge: null }]))
    );
  }, [sections]);

  const dataToDisplay = calibratedSections || sections;
  const xAxisKey = calibratedSections ? 'age' : 'depth';

  const availableProxies = useMemo(() => {
    const proxies = new Set<string>();
    dataToDisplay.forEach(section => {
      section.dataPoints.forEach(dp => {
        Object.keys(dp).forEach(key => {
            if (key !== 'depth' && key !== 'age' && key !== 'subsection') {
                proxies.add(key);
            }
        });
      });
    });
    return Array.from(proxies);
  }, [dataToDisplay]);
  
  React.useEffect(() => {
      if (!availableProxies.includes(selectedProxy) && availableProxies.length > 0) {
          setSelectedProxy(availableProxies[0]);
      } else if (availableProxies.length === 0) {
          setSelectedProxy('delta18O');
      }
  }, [availableProxies, selectedProxy]);


  const handleGenerateAgeModel = async () => {
    if (tiePoints.length < 2) {
      setToast({ message: 'At least two tie-points are required to generate an age model.', type: 'error', show: true });
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateAgeModel(sections, tiePoints);
      onCalibratedDataChange(result);
      setToast({ message: 'Age models generated successfully!', type: 'success', show: true });
    } catch (err: any) {
      setError(err.message);
      setToast({ message: `Error generating age model: ${err.message}`, type: 'error', show: true });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCaptureChart = async () => {
    if (!chartRef.current) {
        setToast({ message: 'Chart element not found.', type: 'error', show: true });
        return;
    }
    setToast({ message: 'Capturing high-resolution chart image...', type: 'info', show: true });
    try {
        const chartBackgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-tertiary').trim();
        const canvas = await html2canvas(chartRef.current, {
            useCORS: true,
            backgroundColor: chartBackgroundColor || '#334155', // Fallback color
            scale: 3, // Render at 3x resolution for high-quality PDF output
        });
        const dataUrl = canvas.toDataURL('image/png');
        const aspectRatio = canvas.width / canvas.height;
        onCaptureChart({ dataUrl, aspectRatio });
        setToast({ message: 'Synthesis chart captured for PDF report.', type: 'success', show: true });
    } catch (error) {
        console.error('Error capturing chart:', error);
        setToast({ message: 'Failed to capture chart image.', type: 'error', show: true });
    }
  };

  const handleRemoveChartFromReport = () => {
      onCaptureChart(null);
      setToast({ message: 'Synthesis chart removed from PDF report.', type: 'info', show: true });
  }

  const handleSpliceIntervalChange = (sectionId: string, type: 'startAge' | 'endAge', value: string) => {
    const numValue = value === '' ? null : parseFloat(value);
    setSpliceIntervals(prev => ({
        ...prev,
        [sectionId]: {
            ...prev[sectionId],
            [type]: numValue,
        }
    }));
  };
  
  const compositeSplice = useMemo(() => {
      if (!calibratedSections) return [];
      
      const allPoints: DataPoint[] = [];

      calibratedSections.forEach(section => {
          const interval = spliceIntervals[section.id];
          if (interval && interval.startAge !== null && interval.endAge !== null) {
              const start = Math.min(interval.startAge, interval.endAge);
              const end = Math.max(interval.startAge, interval.endAge);

              section.dataPoints.forEach(point => {
                  if (point.age !== undefined && point.age >= start && point.age <= end) {
                      allPoints.push(point);
                  }
              });
          }
      });
      
      return allPoints.sort((a, b) => ((a.age as number) || 0) - ((b.age as number) || 0));
  }, [calibratedSections, spliceIntervals]);

  if (sections.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center p-12 bg-background-tertiary/50 rounded-xl text-content-muted border border-border-primary/50">
            <Blend size={48} className="mb-4" />
            <h3 className="text-lg font-semibold text-content-primary">No Sections to Synthesize</h3>
            <p>This core needs at least one section with data to begin synthesis.</p>
        </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Panel: Controls */}
      <div className="lg:col-span-1 space-y-6">
        <AgeModelAssistant
          sections={sections}
          tiePoints={tiePoints}
          onTiePointsChange={setTiePoints}
        />
        <div className="p-4 bg-background-tertiary/50 rounded-xl shadow-lg border border-border-primary/50">
            <button
                onClick={handleGenerateAgeModel}
                disabled={isLoading || tiePoints.length < 2}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-accent-primary text-accent-primary-text font-bold hover:bg-accent-primary-hover transition-all duration-200 shadow-lg hover:shadow-cyan-500/30 disabled:bg-background-interactive disabled:cursor-wait"
            >
                {isLoading ? <Loader2 className="animate-spin" /> : <Wand2 />}
                {isLoading ? 'Generating Models...' : 'Generate Age Models with AI'}
            </button>
            {error && <p className="text-danger-primary text-xs mt-2 text-center">{error}</p>}
        </div>

        <div className="p-4 bg-background-tertiary/50 rounded-xl shadow-lg border border-border-primary/50 space-y-4">
             <h3 className="text-lg font-semibold text-content-primary">Composite Splice Intervals</h3>
             <div className="max-h-60 overflow-y-auto space-y-3 pr-2 -mr-2">
                 {dataToDisplay.map(section => (
                     <div key={section.id} className="p-2 bg-background-primary/50 rounded-md">
                        <p className="text-sm font-bold text-content-secondary">{section.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="number"
                                placeholder="Start Age"
                                value={spliceIntervals[section.id]?.startAge ?? ''}
                                onChange={(e) => handleSpliceIntervalChange(section.id, 'startAge', e.target.value)}
                                className="w-full bg-background-interactive border border-border-secondary rounded-md p-1.5 text-xs"
                                disabled={!calibratedSections}
                             />
                             <span className="text-content-muted">-</span>
                             <input
                                type="number"
                                placeholder="End Age"
                                value={spliceIntervals[section.id]?.endAge ?? ''}
                                onChange={(e) => handleSpliceIntervalChange(section.id, 'endAge', e.target.value)}
                                className="w-full bg-background-interactive border border-border-secondary rounded-md p-1.5 text-xs"
                                disabled={!calibratedSections}
                             />
                        </div>
                     </div>
                 ))}
             </div>
        </div>

      </div>

      {/* Right Panel: Chart */}
      <div className="lg:col-span-2 bg-background-tertiary/50 p-6 rounded-xl shadow-lg border border-border-primary/50">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold text-content-primary">Multi-Section Correlation</h2>
            <div className="flex items-center gap-4">
                <div>
                     <label htmlFor="proxy-select" className="text-xs font-medium text-content-muted mr-2">Proxy:</label>
                     <select
                        id="proxy-select"
                        value={selectedProxy}
                        onChange={e => setSelectedProxy(e.target.value)}
                        className="bg-background-interactive border border-border-secondary rounded-lg p-2 text-sm text-content-primary focus:ring-2 focus:ring-accent-primary focus:outline-none transition"
                        disabled={availableProxies.length === 0}
                     >
                        {availableProxies.length === 0 ? <option>No data</option> :
                         availableProxies.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                </div>
                <div className="flex items-center gap-2" title={xAxisKey === 'depth' ? 'Generate an age model to enable LR04 overlay' : 'Toggle LR04 Overlay'}>
                    <span className="text-xs font-semibold text-content-secondary flex items-center gap-1.5"><Globe size={14}/> LR04</span>
                    <button
                        onClick={() => setShowLr04(prev => !prev)}
                        disabled={xAxisKey === 'depth'}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-background-tertiary disabled:opacity-50 disabled:cursor-not-allowed ${showLr04 ? 'bg-accent-primary' : 'bg-background-interactive'}`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showLr04 ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
                 <div className="flex items-center gap-2">
                    <button
                      onClick={handleCaptureChart}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-xs font-semibold ${
                        isChartCaptured 
                          ? 'bg-success-primary/20 text-success-primary hover:bg-success-primary/30'
                          : 'bg-accent-secondary/20 text-accent-secondary hover:bg-accent-secondary/40'
                      }`}
                      title={isChartCaptured ? "Update captured chart" : "Add this chart to the full PDF report"}
                    >
                      {isChartCaptured ? <CheckCircle size={14} /> : <Camera size={14} />}
                      {isChartCaptured ? 'Update in Report' : 'Add to Report'}
                    </button>
                    {isChartCaptured && (
                      <button
                        onClick={handleRemoveChartFromReport}
                        className="p-2 rounded-lg bg-danger-primary/20 text-danger-primary hover:bg-danger-primary/40 transition-colors"
                        title="Remove chart from report"
                      >
                        <XCircle size={14} />
                      </button>
                    )}
                  </div>
            </div>
        </div>
        <div ref={chartRef}>
            {dataToDisplay.some(s => s.dataPoints?.length > 0) ? (
                <MultiSectionChart
                    sections={dataToDisplay}
                    spliceData={compositeSplice}
                    proxyKey={selectedProxy}
                    xAxisKey={xAxisKey}
                    showLr04={showLr04}
                    lr04Data={LR04_DATA}
                />
            ) : (
                <div className="flex items-center justify-center h-96 text-content-muted">
                    <AlertCircle size={24} className="mr-2"/>
                    <span>No data points in sections to display.</span>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default CoreSynthesisView;
