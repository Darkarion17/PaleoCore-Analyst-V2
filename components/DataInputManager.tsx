import React, { useState, useRef } from 'react';
import type { Section, DataPoint, LabAnalysis } from '../types';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, Database, PlusCircle } from 'lucide-react';
import Papa from 'papaparse';
import { mapCsvHeaders } from '../services/geminiService';
import HeaderMappingModal from './HeaderMappingModal';
import { PROXY_LABELS } from '../constants';

const calculateAveragesFromDataPoints = (dataPoints: DataPoint[]): LabAnalysis => {
    if (!dataPoints || dataPoints.length === 0) {
        return {};
    }
    const sums: { [key: string]: number } = {};
    const counts: { [key: string]: number } = {};
    const labAnalysisKeys: (keyof LabAnalysis)[] = [
        'delta18O', 'delta13C', 'mgCaRatio', 'tex86',
        'alkenoneSST', 'calculatedSST', 'baCa', 'srCa',
        'cdCa', 'radiocarbonDate'
    ];
    labAnalysisKeys.forEach(key => {
        sums[key] = 0;
        counts[key] = 0;
    });
    for (const point of dataPoints) {
        for (const key of labAnalysisKeys) {
            const value = point[key];
            if (typeof value === 'number' && isFinite(value)) {
                sums[key] += value;
                counts[key]++;
            }
        }
    }
    const averages: LabAnalysis = {};
    for (const key of labAnalysisKeys) {
        if (counts[key] > 0) {
            (averages as any)[key] = sums[key] / counts[key];
        }
    }
    return averages;
};

interface DataInputManagerProps {
  section: Section;
  onUpdateSection: (section: Section) => void;
}

const initialFormState: Record<string, string> = {
  subsection: '',
  depth: '',
  delta18O: '',
  delta13C: '',
  mgCaRatio: '',
  tex86: '',
  alkenoneSST: '',
  baCa: '',
  srCa: '',
  cdCa: '',
  radiocarbonDate: '',
};

const manualEntryFields = [
    'depth', 'delta18O', 'delta13C', 'mgCaRatio', 'tex86',
    'alkenoneSST', 'baCa', 'srCa', 'cdCa', 'radiocarbonDate'
];

const DataInputManager: React.FC<DataInputManagerProps> = ({ section, onUpdateSection }) => {
  const [formState, setFormState] = useState({
    ...initialFormState,
    subsection: `Sample ${section.dataPoints.length + 1}`,
  });
  
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<'csv' | 'odv' | null>(null);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{type: 'success'|'error'|'info', msg: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isMappingHeaders, setIsMappingHeaders] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [headerMap, setHeaderMap] = useState<Record<string, string | null>>({});

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleAddDataPoint = () => {
    const subsectionId = formState.subsection.trim();
    if (!subsectionId) {
      setStatus({type: 'error', msg: 'Subsection ID is a required field.'});
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    const newPointData: DataPoint = { subsection: subsectionId };
    let hasValue = false;

    for (const key in formState) {
        if (key !== 'subsection' && formState[key as keyof typeof formState]) {
            const numValue = parseFloat(formState[key as keyof typeof formState]);
            if (!isNaN(numValue)) {
                newPointData[key] = numValue;
                hasValue = true;
            }
        }
    }
    
    if (!hasValue) {
        setStatus({type: 'error', msg: 'At least one data value (e.g., depth) must be provided.'});
        setTimeout(() => setStatus(null), 3000);
        return;
    }

    const existingPointIndex = section.dataPoints.findIndex(dp => dp.subsection === subsectionId);
    let newDataPoints: DataPoint[];

    if (existingPointIndex > -1) {
        newDataPoints = [...section.dataPoints];
        newDataPoints[existingPointIndex] = { ...newDataPoints[existingPointIndex], ...newPointData };
        setStatus({type: 'success', msg: `Subsection "${subsectionId}" updated.`});
    } else {
        newDataPoints = [...section.dataPoints, newPointData];
        setStatus({type: 'success', msg: `Subsection "${subsectionId}" added.`});
    }
    
    newDataPoints.sort((a, b) => (a.depth || 0) - (b.depth || 0));
    
    const newLabAnalysis = calculateAveragesFromDataPoints(newDataPoints);
    onUpdateSection({ ...section, dataPoints: newDataPoints, labAnalysis: newLabAnalysis });

    setFormState({
        ...initialFormState,
        subsection: `Sample ${newDataPoints.length + 1}`
    });
    setTimeout(() => setStatus(null), 3000);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, format: 'csv' | 'odv') => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setFileFormat(format);
      setStatus(null);
      triggerHeaderMapping(selectedFile, format);
    }
  };

  const triggerHeaderMapping = (selectedFile: File, format: 'csv' | 'odv') => {
    setIsProcessing(true);
    setStatus({ type: 'info', msg: `Analyzing ${format.toUpperCase()} headers with AI...` });

    Papa.parse(selectedFile, {
        preview: 1,
        comments: format === 'odv' ? '//' : false,
        delimiter: format === 'odv' ? '\t' : undefined,
        complete: async (results) => {
            const headers = results.meta.fields || [];
            if (headers.length === 0) {
                setStatus({ type: 'error', msg: `Could not read headers from ${format.toUpperCase()}.` });
                setIsProcessing(false);
                return;
            }
            setCsvHeaders(headers);
            const aiMap = await mapCsvHeaders(headers);
            setHeaderMap(aiMap);
            setIsMappingHeaders(true);
            setIsProcessing(false);
            setStatus(null);
        }
    });
  };

  const handleConfirmMapping = (finalMap: Record<string, string | null>) => {
    setIsMappingHeaders(false);
    if (!file) return;

    setIsProcessing(true);
    setStatus({ type: 'info', msg: 'Processing file with new mapping...' });
    
    Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        comments: fileFormat === 'odv' ? '//' : false,
        delimiter: fileFormat === 'odv' ? '\t' : undefined,
        complete: (results) => {
            if (results.errors.length) {
                setStatus({type: 'error', msg: `Parsing Error: ${results.errors[0].message}`});
                setIsProcessing(false);
                return;
            }
            
            const parsedDataFromCsv = results.data.map((row: any) => {
                const newRow: DataPoint = {};
                for(const header in row) {
                    const mappedKey = finalMap[header];
                    if (mappedKey) {
                        const value = row[header];
                        if (value === null || value === '' || typeof value === 'undefined') continue;
                        
                        if (mappedKey === 'subsection') {
                            newRow[mappedKey] = String(value);
                        } else {
                            const numValue = parseFloat(String(value).replace(',', '.'));
                            if (!isNaN(numValue)) {
                               newRow[mappedKey] = numValue;
                            }
                        }
                    }
                }
                return newRow;
            }).filter(dp => Object.keys(dp).length > 0);

            if (parsedDataFromCsv.length === 0) {
                setStatus({ type: 'error', msg: 'No valid data points could be parsed from the file.' });
                setIsProcessing(false);
                return;
            }
            
            const sectionPointsMap = new Map(section.dataPoints.map(p => [p.subsection, p]));
            let updatedCount = 0;
            let addedCount = 0;

            parsedDataFromCsv.forEach((newPoint, index) => {
                const subsectionId = newPoint.subsection;
                if (subsectionId && typeof subsectionId === 'string' && subsectionId.trim() !== '') {
                    if (sectionPointsMap.has(subsectionId)) {
                        updatedCount++;
                    } else {
                        addedCount++;
                    }
                    sectionPointsMap.set(subsectionId, { ...sectionPointsMap.get(subsectionId), ...newPoint });
                } else {
                    const uniqueId = `Imported-${Date.now()}-${index}`;
                    sectionPointsMap.set(uniqueId, { ...newPoint, subsection: uniqueId });
                    addedCount++;
                }
            });

            const mergedPoints = Array.from(sectionPointsMap.values()).sort((a,b) => (a.depth || 0) - (b.depth || 0));
            const newLabAnalysis = calculateAveragesFromDataPoints(mergedPoints);

            onUpdateSection({ ...section, dataPoints: mergedPoints, labAnalysis: newLabAnalysis });
            setStatus({ type: 'success', msg: `${addedCount} new subsections added, ${updatedCount} updated.` });
            resetFileInput();
            setTimeout(() => setStatus(null), 4000);
        },
        error: (err) => {
            setStatus({ type: 'error', msg: `File Read Error: ${err.message}` });
            setIsProcessing(false);
            setTimeout(() => setStatus(null), 4000);
        }
    });
  };
  
  const resetFileInput = () => {
      setFile(null);
      setFileName('');
      setFileFormat(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setIsProcessing(false);
  };
  
  const handleCancelMapping = () => {
    setIsMappingHeaders(false);
    resetFileInput();
    setStatus(null);
  };
  
  const handleUploadClick = (format: 'csv' | 'odv') => {
      if (fileInputRef.current) {
          fileInputRef.current.setAttribute('accept', format === 'csv' ? '.csv' : '.txt');
          fileInputRef.current.onchange = (e) => handleFileChange(e as unknown as React.ChangeEvent<HTMLInputElement>, format);
          fileInputRef.current.click();
      }
  };

  const inputClass = "w-full bg-background-interactive border border-border-secondary rounded-md p-2 text-sm text-content-primary placeholder-content-muted focus:ring-1 focus:ring-accent-primary focus:outline-none transition";
  const labelClass = "block text-xs font-medium text-content-secondary mb-1";
  
  return (
    <div className="space-y-6">
      {isMappingHeaders && (
        <HeaderMappingModal
            headers={csvHeaders}
            suggestedMap={headerMap}
            onConfirm={handleConfirmMapping}
            onClose={handleCancelMapping}
        />
      )}
      
      <div className="p-4 bg-background-primary/30 rounded-lg border border-border-primary">
        <h3 className="text-lg font-semibold text-content-primary flex items-center gap-2 mb-3"><Database size={20} className="text-accent-primary"/> Manual Subsection Entry</h3>
        <p className="text-xs text-content-muted mb-4">Enter a unique Subsection ID and one or more data values to add or update a point in the series.</p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="col-span-2">
                <label htmlFor="subsection" className={`${labelClass} text-accent-primary font-bold`}>{PROXY_LABELS['subsection'] || 'Subsection ID*'}</label>
                <input type="text" name="subsection" value={formState.subsection} onChange={handleFormChange} className={inputClass} required />
            </div>
            {manualEntryFields.map(key => (
                <div key={key}>
                    <label htmlFor={key} className={labelClass}>{PROXY_LABELS[key] || key}</label>
                    <input type="number" step="any" name={key} value={formState[key as keyof typeof formState]} onChange={handleFormChange} className={inputClass} />
                </div>
            ))}
        </div>
        <div className="flex justify-end mt-4">
            <button onClick={handleAddDataPoint} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary/20 text-accent-primary-hover hover:bg-accent-primary/30 transition-colors text-sm font-semibold">
                <PlusCircle size={16}/> Add/Update Subsection
            </button>
        </div>
      </div>
      
      <div className="p-4 bg-background-primary/30 rounded-lg border border-border-primary">
        <h3 className="text-lg font-semibold text-content-primary flex items-center gap-2 mb-2"><UploadCloud size={20} className="text-accent-primary"/> Bulk Data Upload</h3>
        <p className="text-xs text-content-muted mb-3">Upload a file to add or merge subsections. The AI will help map columns. Rows with matching Subsection IDs will be updated.</p>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="flex-grow w-full">
                <div className="flex gap-2">
                    <button onClick={() => handleUploadClick('csv')} className="flex-1 text-center font-semibold text-sm py-2 px-4 rounded-lg bg-background-interactive text-content-primary hover:bg-background-interactive-hover transition">Upload CSV</button>
                    <button onClick={() => handleUploadClick('odv')} className="flex-1 text-center font-semibold text-sm py-2 px-4 rounded-lg bg-background-interactive text-content-primary hover:bg-background-interactive-hover transition">Upload ODV (.txt)</button>
                </div>
                 <input type="file" ref={fileInputRef} className="sr-only"/>
            </div>
            {fileName && (
                <div className="bg-background-tertiary text-sm py-2 px-4 rounded-lg w-full sm:w-auto">
                    <span className="font-semibold text-content-secondary">Selected: </span>
                    <span className="text-content-muted truncate">{fileName}</span>
                </div>
            )}
        </div>
      </div>
      
      {status && (
        <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 text-sm animate-fade-in-fast ${status.type === 'success' ? 'bg-success-primary/20 text-success-primary' : status.type === 'error' ? 'bg-danger-primary/20 text-danger-primary' : 'bg-accent-secondary/20 text-accent-secondary'}`}>
            {isProcessing ? <Loader2 size={18} className="animate-spin"/> : status.type === 'success' ? <CheckCircle size={18}/> : <AlertCircle size={18}/>}
            {status.msg}
        </div>
      )}
       <style>{`
        @keyframes fade-in-fast { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in-fast { animation: fade-in-fast 0.2s ease-out forwards; }
    `}</style>
    </div>
  );
};

export default DataInputManager;