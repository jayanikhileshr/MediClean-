import React, { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import type {
  GovernancePolicy,
  IssueCategory,
  NavPage,
  QualityAssessmentReport,
} from '../types/mediclean';
import { ALL_ISSUE_CATEGORIES } from '../engine/qualityAssessor';
import { maskCellValue, maskPatientId } from '../engine/governance';

interface QualityViewProps {
  originalReport: QualityAssessmentReport;
  cleanedReport: QualityAssessmentReport | null;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  onNavigate: (page: NavPage) => void;
}

const ISSUES_PER_PAGE = 15;

export const QualityView: React.FC<QualityViewProps> = ({
  originalReport,
  cleanedReport,
  policy,
  allowUnmask,
  onNavigate,
}) => {
  const [target, setTarget] = useState<'original' | 'cleaned'>(cleanedReport ? 'cleaned' : 'original');
  const [selectedCategory, setSelectedCategory] = useState<IssueCategory | 'All'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);

  const report = target === 'cleaned' && cleanedReport ? cleanedReport : originalReport;

  const filteredIssues = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return report.issues.filter((issue) => {
      if (selectedCategory !== 'All' && issue.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        issue.column.toLowerCase().includes(q) ||
        issue.category.toLowerCase().includes(q) ||
        issue.reason.toLowerCase().includes(q) ||
        maskPatientId(issue.patientId).toLowerCase().includes(q)
      );
    });
  }, [report.issues, selectedCategory, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / ISSUES_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleIssues = filteredIssues.slice(
    safePage * ISSUES_PER_PAGE,
    (safePage + 1) * ISSUES_PER_PAGE
  );

  const dimensionsList: Array<{ label: string; value: number; weight: string }> = [
    { label: 'Completeness', value: report.dimensions.completeness, weight: '25% weight' },
    { label: 'Validity', value: report.dimensions.validity, weight: '25% weight' },
    { label: 'Uniqueness', value: report.dimensions.uniqueness, weight: '20% weight' },
    { label: 'Consistency', value: report.dimensions.consistency, weight: '15% weight' },
    { label: 'Integrity', value: report.dimensions.integrity, weight: '15% weight' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
            Data Quality Assessment
          </h1>
          <p className="text-[14px] text-[#5A665E] mt-1">
            Automated scan across 10 clinical data-quality dimensions, statistical outlier fences, and identifier integrity rules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {cleanedReport && (
            <div className="inline-flex p-1 rounded-xl bg-white/75 border border-[#202923]/8">
              <button
                type="button"
                onClick={() => {
                  setTarget('original');
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  target === 'original'
                    ? 'bg-[#4A6A55] text-white'
                    : 'text-[#5A665E] hover:text-[#202923]'
                }`}
              >
                Original ({originalReport.overallScore.toFixed(1)}%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTarget('cleaned');
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
                  target === 'cleaned'
                    ? 'bg-[#4A6A55] text-white'
                    : 'text-[#5A665E] hover:text-[#202923]'
                }`}
              >
                Cleaned ({cleanedReport.overallScore.toFixed(1)}%)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigate('cleaning')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium transition-colors whitespace-nowrap"
          >
            <span>Configure Automated Cleaning</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quality Score Overview & 5 Governance Dimensions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="glass-panel p-6 lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="text-[13px] font-medium text-[#5A665E]">Composite Quality Score</div>
            <div className="mt-3 font-mono tabular-nums text-[44px] font-semibold tracking-tight text-[#202923] leading-none">
              {report.overallScore.toFixed(1)}
              <span className="text-[20px] text-[#78827B] font-normal">/100</span>
            </div>
            <div className="mt-3 text-[13px] font-medium text-[#202923]">
              {report.overallScore >= 92
                ? 'Enterprise Clinical Readiness'
                : report.overallScore >= 75
                ? 'Moderate Remediation Required'
                : 'Critical Remediation Required'}
            </div>
            <p className="mt-1.5 text-[12px] text-[#5A665E] leading-relaxed">
              Computed dynamically across {report.totalRecords.toLocaleString()} records and{' '}
              {report.totalCells.toLocaleString()} evaluated data cells.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-[#202923]/8 flex items-center justify-between text-[12px] font-mono tabular-nums text-[#5A665E]">
            <span>{report.totalIssuesCount.toLocaleString()} total findings</span>
            <span>{report.invalidRecordsCount.toLocaleString()} affected rows</span>
          </div>
        </div>

        <div className="glass-panel p-6 lg:col-span-8">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Five-Pillar Quality Breakdown
            </h2>
            <span className="text-[12px] text-[#5A665E]">Weighted scoring model</span>
          </div>

          <div className="space-y-4">
            {dimensionsList.map((dim) => (
              <div key={dim.label}>
                <div className="flex items-baseline justify-between text-[13px] mb-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-[#202923]">{dim.label}</span>
                    <span className="text-[11px] text-[#78827B]">{dim.weight}</span>
                  </div>
                  <span className="font-mono tabular-nums font-semibold text-[#202923]">
                    {dim.value.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#202923]/8 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, dim.value))}%`,
                      backgroundColor:
                        dim.value >= 90 ? '#4A6A55' : dim.value >= 75 ? '#789681' : '#A86416',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10 Diagnostic Categories Selector Grid */}
      <section className="glass-panel p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Diagnostic Breakdown by Issue Category
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Select any category below to filter the record-level diagnostic table.
            </p>
          </div>
          {selectedCategory !== 'All' && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('All');
                setPage(0);
              }}
              className="text-[12px] font-medium text-[#4A6A55] hover:underline"
            >
              Show All Categories
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ALL_ISSUE_CATEGORIES.map((category) => {
            const count = report.issuesByCategory[category] ?? 0;
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => {
                  setSelectedCategory(active ? 'All' : category);
                  setPage(0);
                }}
                className={`text-left p-3.5 rounded-xl border transition-colors ${
                  active
                    ? 'bg-[#4A6A55] border-[#4A6A55] text-white'
                    : 'bg-white/70 hover:bg-white border-[#202923]/8 text-[#202923]'
                }`}
              >
                <div
                  className={`text-[12px] font-medium truncate ${
                    active ? 'text-white/90' : 'text-[#5A665E]'
                  }`}
                >
                  {category}
                </div>
                <div className="mt-1.5 font-mono tabular-nums text-[22px] font-semibold">
                  {count.toLocaleString()}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Record-Level Issue Drill-Down Table */}
      <section className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Detected Issues Log
              {selectedCategory !== 'All' ? ` — ${selectedCategory}` : ''}
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Showing {filteredIssues.length.toLocaleString()} findings (PHI values automatically masked).
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#78827B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              placeholder="Search column or reason..."
              className="h-9 pl-8 pr-3 rounded-xl bg-white/85 border border-[#202923]/10 text-[13px] text-[#202923] placeholder:text-[#78827B] focus:outline-none focus:ring-2 focus:ring-[#4A6A55] w-60"
            />
          </div>
        </div>

        {visibleIssues.length === 0 ? (
          <div className="surface-solid py-12 px-6 text-center">
            <div className="text-[15px] font-semibold text-[#2B6B4F]">
              Zero issues matched this filter
            </div>
            <p className="text-[13px] text-[#5A665E] mt-1">
              {target === 'cleaned'
                ? 'All checked criteria in this category passed cleanly after automated remediation.'
                : 'Try clearing your search query or selecting another category.'}
            </p>
          </div>
        ) : (
          <div className="surface-solid overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                  <th className="py-2.5 px-3 font-medium">Row</th>
                  <th className="py-2.5 px-3 font-medium">Patient ID</th>
                  <th className="py-2.5 px-3 font-medium">Category</th>
                  <th className="py-2.5 px-3 font-medium">Column</th>
                  <th className="py-2.5 px-3 font-medium">Severity</th>
                  <th className="py-2.5 px-3 font-medium">Observed Value</th>
                  <th className="py-2.5 px-3 font-medium">Diagnostic & Recommended Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#202923]/6">
                {visibleIssues.map((issue) => (
                  <tr key={issue.id} className="hover:bg-[#789681]/6">
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#78827B]">
                      {issue.rowIndex + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#202923] whitespace-nowrap">
                      {allowUnmask ? issue.patientId : maskPatientId(issue.patientId)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#202923] whitespace-nowrap">
                      {issue.category}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#5A665E] whitespace-nowrap">
                      {issue.column}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium">
                      <span
                        className={
                          issue.severity === 'Critical'
                            ? 'text-[#B53838]'
                            : issue.severity === 'Warning'
                            ? 'text-[#A86416]'
                            : 'text-[#5A665E]'
                        }
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#202923] max-w-[170px] truncate">
                      {issue.rawValue === '(empty)'
                        ? '(empty)'
                        : maskCellValue(issue.column, issue.rawValue, policy, allowUnmask)}
                    </td>
                    <td className="py-2.5 px-3 text-[#5A665E] min-w-[260px]">
                      <div className="text-[#202923]">{issue.reason}</div>
                      <div className="text-[11px] text-[#4A6A55] mt-0.5">
                        Fix: {issue.recommendedFix}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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
