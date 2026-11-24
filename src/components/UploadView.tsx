import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Search,
  UploadCloud,
} from 'lucide-react';
import type {
  ColumnProfile,
  DatasetState,
  GovernancePolicy,
  UserRole,
} from '../types/mediclean';
import {
  SAMPLE_DATASETS,
  generateSyntheticDataset,
  type SampleDatasetDescriptor,
} from '../engine/syntheticGenerator';
import {
  ROLE_MATRIX,
  maskCellValue,
  profileDatasetColumns,
} from '../engine/governance';
import { exportDatasetToCsv, parseUploadedFile } from '../engine/exporter';

interface UploadViewProps {
  dataset: DatasetState;
  activeRole: UserRole;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  onDatasetLoaded: (
    name: string,
    sourceType: 'Uploaded CSV' | 'Uploaded Excel' | 'Synthetic Sample',
    columns: string[],
    rows: DatasetState['originalRows']
  ) => Promise<void>;
}

const ROWS_PER_PAGE = 12;

export const UploadView: React.FC<UploadViewProps> = ({
  dataset,
  activeRole,
  policy,
  allowUnmask,
  onDatasetLoaded,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [previewTarget, setPreviewTarget] = useState<'original' | 'cleaned'>('original');

  const canUpload = ROLE_MATRIX[activeRole].canUpload;
  const activeRows =
    previewTarget === 'cleaned' && dataset.cleanedRows ? dataset.cleanedRows : dataset.originalRows;
  const activeColumns = useMemo(() => {
    if (previewTarget === 'cleaned' && dataset.cleanedRows && dataset.cleanedRows.length > 0) {
      return Object.keys(dataset.cleanedRows[0]);
    }
    return dataset.columns;
  }, [dataset, previewTarget]);

  const columnProfiles: ColumnProfile[] = useMemo(
    () => profileDatasetColumns(activeColumns, activeRows, policy, allowUnmask),
    [activeColumns, activeRows, policy, allowUnmask]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return activeRows;
    return activeRows.filter((row) =>
      activeColumns.some((col) => {
        const display = maskCellValue(col, row[col], policy, allowUnmask).toLowerCase();
        return display.includes(q);
      })
    );
  }, [activeRows, activeColumns, searchTerm, policy, allowUnmask]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = filteredRows.slice(
    safePage * ROWS_PER_PAGE,
    (safePage + 1) * ROWS_PER_PAGE
  );

  const handleFileProcess = async (file: File) => {
    if (!canUpload) {
      setErrorMsg(`Role "${activeRole}" has read-only permissions. Switch to Privacy Officer or Data Steward to upload datasets.`);
      return;
    }
    setErrorMsg(null);
    setUploading(true);
    try {
      const parsed = await parseUploadedFile(file);
      await onDatasetLoaded(parsed.name, parsed.sourceType, parsed.columns, parsed.rows);
      setPreviewTarget('original');
      setPage(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse uploaded healthcare dataset.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFileProcess(file);
    }
  };

  const handleLoadSample = async (sample: SampleDatasetDescriptor) => {
    if (!canUpload) {
      setErrorMsg(`Role "${activeRole}" cannot load new datasets. Switch to Privacy Officer or Data Steward.`);
      return;
    }
    setErrorMsg(null);
    setUploading(true);
    try {
      const rows = generateSyntheticDataset(sample);
      const cols = Object.keys(rows[0] || {});
      await onDatasetLoaded(sample.name, 'Synthetic Sample', cols, rows);
      setPreviewTarget('original');
      setPage(0);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = (sample: SampleDatasetDescriptor) => {
    const rows = generateSyntheticDataset(sample);
    exportDatasetToCsv(rows, sample.name, false, policy);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
            Healthcare Dataset Ingestion
          </h1>
          <p className="text-[14px] text-[#5A665E] mt-1">
            Upload CSV or Excel clinical files or load a synthetic 1,000+ record hospital registry. Original source files are preserved read-only.
          </p>
        </div>
        <div className="text-[12px] font-mono tabular-nums text-[#5A665E]">
          Active: {dataset.name} · {dataset.originalRows.length.toLocaleString()} rows · {dataset.columns.length} columns
        </div>
      </div>

      {/* Upload Dropzone + Synthetic Sample Selector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="glass-panel p-6 xl:col-span-5 flex flex-col justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">Upload Clinical File</h2>
            <p className="text-[13px] text-[#5A665E] mt-1">
              Supports <span className="font-mono">.csv</span>, <span className="font-mono">.xlsx</span>, and{' '}
              <span className="font-mono">.xls</span> up to 25 MB.
            </p>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`mt-5 rounded-2xl border-2 border-dashed p-7 text-center transition-colors ${
              dragActive
                ? 'border-[#4A6A55] bg-[#789681]/10'
                : 'border-[#789681]/40 bg-white/45 hover:bg-white/65'
            }`}
          >
            <UploadCloud className="w-8 h-8 text-[#4A6A55] mx-auto" />
            <div className="mt-3 text-[14px] font-medium text-[#202923]">
              {uploading ? 'Parsing and profiling dataset...' : 'Drop healthcare dataset here'}
            </div>
            <div className="mt-1 text-[12px] text-[#5A665E]">
              Direct PHI columns are automatically detected and masked upon preview.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileProcess(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={!canUpload || uploading}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A6A55] hover:bg-[#385342] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Browse CSV / Excel</span>
            </button>
          </div>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-xl bg-[#B53838]/8 border border-[#B53838]/20 text-[12px] text-[#8E2828] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </section>

        <section className="glass-panel p-6 xl:col-span-7">
          <div className="flex items-baseline justify-between gap-2 mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Synthetic Hospital Sample Datasets
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                Fictional 1,000+ record datasets engineered with realistic clinical defects for evaluation.
              </p>
            </div>
          </div>

          <div className="divide-y divide-[#202923]/8">
            {SAMPLE_DATASETS.map((sample) => {
              const isCurrent = dataset.name === sample.name;
              return (
                <div
                  key={sample.id}
                  className="py-3.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-[#202923] flex items-center gap-2">
                      <span className="truncate">{sample.name}</span>
                      {isCurrent && (
                        <span className="text-[11px] font-medium text-[#2B6B4F] whitespace-nowrap">
                          · Loaded
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[#5A665E] mt-0.5 leading-relaxed">
                      {sample.description}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#78827B] mt-1">
                      {sample.recordCount.toLocaleString()} records · 12 columns · {sample.facility}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadSample(sample)}
                      title="Download raw synthetic CSV"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white border border-[#202923]/10 text-[12px] font-medium text-[#202923] whitespace-nowrap transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      disabled={!canUpload || uploading}
                      onClick={() => void handleLoadSample(sample)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4A6A55] hover:bg-[#385342] disabled:opacity-50 text-white text-[12px] font-medium whitespace-nowrap transition-colors"
                    >
                      Load Dataset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Schema & Column Type Profiler */}
      <section className="glass-panel p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Schema, Data Types & Privacy Classification
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Automatic type inference, completeness profiling, and HIPAA Safe Harbor sensitivity tagging.
            </p>
          </div>
          <span className="text-[12px] font-mono tabular-nums text-[#5A665E]">
            {columnProfiles.length} columns profiled
          </span>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[12px] text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-4 font-medium">Column Name</th>
                <th className="py-2.5 px-4 font-medium">Inferred Type</th>
                <th className="py-2.5 px-4 font-medium text-right">Completeness</th>
                <th className="py-2.5 px-4 font-medium text-right">Missing</th>
                <th className="py-2.5 px-4 font-medium text-right">Unique</th>
                <th className="py-2.5 px-4 font-medium">Sensitivity Class</th>
                <th className="py-2.5 px-4 font-medium">Sample Values (Masked)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {columnProfiles.map((col) => (
                <tr key={col.name} className="hover:bg-[#789681]/6 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-medium text-[#202923] whitespace-nowrap">
                    {col.name}
                  </td>
                  <td className="py-2.5 px-4 text-[#5A665E] font-mono text-[12px] whitespace-nowrap">
                    {col.inferredType}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#202923]">
                    {col.completenessPct.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#5A665E]">
                    {col.missingCount.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#5A665E]">
                    {col.uniqueCount.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-4 whitespace-nowrap text-[12px]">
                    <span
                      className={
                        col.piiCategory === 'Direct Identifier (PHI)'
                          ? 'font-medium text-[#8E2828]'
                          : col.piiCategory === 'Clinical Sensitive'
                          ? 'font-medium text-[#4A6A55]'
                          : 'text-[#5A665E]'
                      }
                    >
                      {col.piiCategory}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[12px] font-mono text-[#5A665E] max-w-[260px] truncate">
                    {col.sampleValues.join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Dataset Preview Table */}
      <section className="glass-panel p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Dataset Preview ({previewTarget === 'cleaned' && dataset.cleanedRows ? 'Cleaned' : 'Original'})
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Showing {filteredRows.length.toLocaleString()} matching records. Direct patient identifiers are masked per Governance Policy.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {dataset.cleanedRows && (
              <div className="inline-flex p-1 rounded-xl bg-white/75 border border-[#202923]/8">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget('original');
                    setPage(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                    previewTarget === 'original'
                      ? 'bg-[#4A6A55] text-white'
                      : 'text-[#5A665E] hover:text-[#202923]'
                  }`}
                >
                  Original ({dataset.originalRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewTarget('cleaned');
                    setPage(0);
                  }}
                  className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                    previewTarget === 'cleaned'
                      ? 'bg-[#4A6A55] text-white'
                      : 'text-[#5A665E] hover:text-[#202923]'
                  }`}
                >
                  Cleaned ({dataset.cleanedRows.length})
                </button>
              </div>
            )}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#78827B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter records..."
                className="h-9 pl-8 pr-3 rounded-xl bg-white/85 border border-[#202923]/10 text-[13px] text-[#202923] placeholder:text-[#78827B] focus:outline-none focus:ring-2 focus:ring-[#4A6A55] w-52"
              />
            </div>
          </div>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-3 font-medium font-mono">#</th>
                {activeColumns.map((col) => (
                  <th key={col} className="py-2.5 px-3 font-medium whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {visibleRows.map((row, idx) => (
                <tr key={safePage * ROWS_PER_PAGE + idx} className="hover:bg-[#789681]/6">
                  <td className="py-2 px-3 font-mono tabular-nums text-[#78827B]">
                    {safePage * ROWS_PER_PAGE + idx + 1}
                  </td>
                  {activeColumns.map((col) => {
                    const display = maskCellValue(col, row[col], policy, allowUnmask);
                    const isEmpty = display === '—';
                    return (
                      <td
                        key={col}
                        className={`py-2 px-3 whitespace-nowrap font-mono tabular-nums ${
                          isEmpty ? 'text-[#B53838]' : 'text-[#202923]'
                        }`}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-[12px] text-[#5A665E]">
          <span className="font-mono tabular-nums">
            Page {safePage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/80 border border-[#202923]/10 text-[#202923] disabled:opacity-40 hover:bg-white transition-colors"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1.5 rounded-lg bg-white/80 border border-[#202923]/10 text-[#202923] disabled:opacity-40 hover:bg-white transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
