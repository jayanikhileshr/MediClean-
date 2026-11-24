import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  CleaningResult,
  DatasetState,
  NavPage,
  QualityAssessmentReport,
  UserRole,
  ValidationSuiteReport,
} from '../types/mediclean';
import { ALL_ISSUE_CATEGORIES } from '../engine/qualityAssessor';

interface DashboardViewProps {
  dataset: DatasetState;
  activeRole: UserRole;
  originalReport: QualityAssessmentReport;
  cleanedReport: QualityAssessmentReport | null;
  cleaningResult: CleaningResult | null;
  validationReport: ValidationSuiteReport | null;
  onNavigate: (page: NavPage) => void;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255, 255, 255, 0.94)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(32, 41, 35, 0.1)',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(31, 45, 35, 0.08)',
  color: '#202923',
  fontSize: '12px',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  activeRole,
  originalReport,
  cleanedReport,
  cleaningResult,
  validationReport,
  onNavigate,
}) => {
  const activeReport = cleanedReport ?? originalReport;
  const scoreDelta = cleanedReport
    ? Number((cleanedReport.overallScore - originalReport.overallScore).toFixed(1))
    : 0;

  const issuesCategoryData = useMemo(() => {
    return ALL_ISSUE_CATEGORIES.map((category) => ({
      category: category.replace('Invalid ', 'Inv. ').replace('Inconsistent ', 'Incons. '),
      fullCategory: category,
      Original: originalReport.issuesByCategory[category] ?? 0,
      Cleaned: cleanedReport ? cleanedReport.issuesByCategory[category] ?? 0 : 0,
    })).sort((a, b) => b.Original - a.Original);
  }, [originalReport, cleanedReport]);

  const dimensionComparisonData = useMemo(() => {
    const keys: Array<{ key: keyof QualityAssessmentReport['dimensions']; label: string }> = [
      { key: 'completeness', label: 'Completeness' },
      { key: 'uniqueness', label: 'Uniqueness' },
      { key: 'validity', label: 'Validity' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'integrity', label: 'Integrity' },
    ];
    return keys.map(({ key, label }) => ({
      dimension: label,
      Before: originalReport.dimensions[key],
      After: cleanedReport ? cleanedReport.dimensions[key] : originalReport.dimensions[key],
    }));
  }, [originalReport, cleanedReport]);

  const anomalyScatterNormal = useMemo(
    () => activeReport.anomalies.filter((a) => !a.isOutlier),
    [activeReport.anomalies]
  );
  const anomalyScatterOutliers = useMemo(
    () => activeReport.anomalies.filter((a) => a.isOutlier),
    [activeReport.anomalies]
  );

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/* Welcome Banner (Glassmorphism Hero Strip) */}
      <section className="glass-panel p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="text-[13px] text-[#5A665E]">
            {greeting}, {activeRole}
            <span className="mx-2 text-[#A2BDB0]" aria-hidden="true">·</span>
            HIPAA Safe Harbor Masking Active
          </div>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-[#202923] leading-tight">
            Clinical Data Governance Overview
          </h1>
          <p className="text-[14px] text-[#5A665E] leading-relaxed">
            Monitoring <span className="font-medium text-[#202923]">{dataset.name}</span> —{' '}
            <span className="font-mono tabular-nums text-[#202923]">
              {activeReport.totalRecords.toLocaleString()}
            </span>{' '}
            active records across{' '}
            <span className="font-mono tabular-nums text-[#202923]">{activeReport.totalColumns}</span>{' '}
            clinical attributes. Original source records remain immutable.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!cleanedReport ? (
            <button
              type="button"
              onClick={() => onNavigate('cleaning')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              <span>Review Cleaning Plan</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium transition-colors whitespace-nowrap"
            >
              <span>Export Cleaned Dataset</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('quality')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/80 hover:bg-white border border-[#202923]/10 text-[#202923] text-[13px] font-medium transition-colors whitespace-nowrap"
          >
            <span>Inspect Quality Diagnostics</span>
          </button>
        </div>
      </section>

      {/* Primary 4 Glassmorphic KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" aria-label="Key quality metrics">
        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#5A665E]">Total Patient Records</span>
            <Database className="w-4 h-4 text-[#789681]" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-[30px] font-semibold text-[#202923] tracking-tight">
            {activeReport.totalRecords.toLocaleString()}
          </div>
          <div className="mt-2 text-[12px] text-[#5A665E] font-mono tabular-nums">
            {cleanedReport
              ? `${originalReport.totalRecords.toLocaleString()} raw · ${cleaningResult?.removedDuplicateCount ?? 0} dupes removed`
              : `${originalReport.duplicateRecordsCount} duplicate records detected`}
          </div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#5A665E]">Overall Data Quality Score</span>
            <Activity className="w-4 h-4 text-[#789681]" />
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="font-mono tabular-nums text-[30px] font-semibold text-[#202923] tracking-tight">
              {activeReport.overallScore.toFixed(1)}%
            </span>
            {cleanedReport && scoreDelta > 0 && (
              <span className="font-mono tabular-nums text-[12px] font-medium text-[#2B6B4F]">
                +{scoreDelta.toFixed(1)} pts
              </span>
            )}
          </div>
          <div className="mt-2 text-[12px] text-[#5A665E] font-mono tabular-nums">
            {cleanedReport
              ? `Up from ${originalReport.overallScore.toFixed(1)}% initial baseline`
              : 'Weighted across 5 governance dimensions'}
          </div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#5A665E]">Issues Detected</span>
            <AlertTriangle className="w-4 h-4 text-[#A86416]" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-[30px] font-semibold text-[#202923] tracking-tight">
            {activeReport.totalIssuesCount.toLocaleString()}
          </div>
          <div className="mt-2 text-[12px] text-[#5A665E] font-mono tabular-nums">
            {activeReport.missingCellsCount.toLocaleString()} missing · {activeReport.invalidRecordsCount.toLocaleString()} affected rows
          </div>
        </div>

        <div className="glass-panel p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#5A665E]">Records Cleaned</span>
            <CheckCircle2 className="w-4 h-4 text-[#2B6B4F]" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-[30px] font-semibold text-[#202923] tracking-tight">
            {cleaningResult ? cleaningResult.recordsCleanedCount.toLocaleString() : '0'}
          </div>
          <div className="mt-2 text-[12px] text-[#5A665E] font-mono tabular-nums">
            {cleaningResult
              ? `${cleaningResult.cellsModifiedCount.toLocaleString()} cell transformations applied`
              : 'Run Automated Data Cleaning to remediate'}
          </div>
        </div>
      </section>

      {/* Secondary Quantitative Strip */}
      <section className="glass-panel px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-[#202923]/8">
        <div className="pt-2 md:pt-0">
          <div className="text-[12px] text-[#5A665E]">Missing Values Detected</div>
          <div className="mt-1 font-mono tabular-nums text-[18px] font-semibold text-[#202923]">
            {activeReport.missingCellsCount.toLocaleString()}
          </div>
        </div>
        <div className="pt-2 md:pt-0 md:pl-5">
          <div className="text-[12px] text-[#5A665E]">Duplicate Records</div>
          <div className="mt-1 font-mono tabular-nums text-[18px] font-semibold text-[#202923]">
            {activeReport.duplicateRecordsCount.toLocaleString()}
          </div>
        </div>
        <div className="pt-2 md:pt-0 md:pl-5">
          <div className="text-[12px] text-[#5A665E]">Invalid Patient Rows</div>
          <div className="mt-1 font-mono tabular-nums text-[18px] font-semibold text-[#202923]">
            {activeReport.invalidRecordsCount.toLocaleString()}
          </div>
        </div>
        <div className="pt-2 md:pt-0 md:pl-5">
          <div className="text-[12px] text-[#5A665E]">Validation Pass Rate</div>
          <div className="mt-1 font-mono tabular-nums text-[18px] font-semibold text-[#202923]">
            {validationReport ? `${validationReport.overallPassRate.toFixed(1)}%` : 'Pending'}
          </div>
        </div>
      </section>

      {/* Primary Charts Row: Issues by Category & Before/After Dimensions */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="glass-panel p-6 xl:col-span-7 flex flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Data Quality Issues by Category
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                {cleanedReport
                  ? 'Comparing detected defects in Original vs. Cleaned datasets.'
                  : 'Automated diagnostic count across all 10 clinical quality dimensions.'}
              </p>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#5A665E]">
              {originalReport.totalIssuesCount.toLocaleString()} raw findings
            </span>
          </div>

          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={issuesCategoryData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(32, 41, 35, 0.07)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#5A665E', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={{ stroke: 'rgba(32,41,35,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  dataKey="category"
                  type="category"
                  width={132}
                  tick={{ fill: '#202923', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(120, 150, 129, 0.08)' }} />
                {cleanedReport && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                <Bar
                  dataKey="Original"
                  name="Original Dataset"
                  fill="#789681"
                  radius={[0, 6, 6, 0]}
                  barSize={cleanedReport ? 10 : 16}
                />
                {cleanedReport && (
                  <Bar
                    dataKey="Cleaned"
                    name="Cleaned Dataset"
                    fill="#385342"
                    radius={[0, 6, 6, 0]}
                    barSize={10}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 xl:col-span-5 flex flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Before & After Quality Dimensions
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                Percentage compliance across the five governance pillars.
              </p>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#5A665E]">
              0–100 scale
            </span>
          </div>

          <div className="h-[310px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dimensionComparisonData}
                margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(32, 41, 35, 0.07)" vertical={false} />
                <XAxis
                  dataKey="dimension"
                  tick={{ fill: '#202923', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(32,41,35,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#5A665E', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(120, 150, 129, 0.08)' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Before" name="Original Score (%)" fill="#A2BDB0" radius={[6, 6, 0, 0]} barSize={20} />
                <Bar
                  dataKey="After"
                  name={cleanedReport ? 'Cleaned Score (%)' : 'Current Score (%)'}
                  fill="#4A6A55"
                  radius={[6, 6, 0, 0]}
                  barSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Secondary Charts Row: Anomaly Detection Scatter & Department Quality Summary */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="glass-panel p-6 xl:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Statistical Billing Anomaly Detection (Age vs. Treatment Cost)
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                Z-score (&gt;3.0) and IQR fence anomaly isolation across sampled patient admissions.
              </p>
            </div>
            <span className="text-[12px] font-mono tabular-nums text-[#5A665E]">
              {activeReport.outlierRecordsCount} anomalies active
            </span>
          </div>

          <div className="h-[270px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 16, left: 6, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(32, 41, 35, 0.07)" />
                <XAxis
                  type="number"
                  dataKey="age"
                  name="Age"
                  unit=" yrs"
                  domain={[0, 100]}
                  tick={{ fill: '#5A665E', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                />
                <YAxis
                  type="number"
                  dataKey="treatmentCost"
                  name="Cost"
                  tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                  tick={{ fill: '#5A665E', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                />
                <ZAxis range={[36, 68]} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown, name: unknown) => {
                    const num = Number(value);
                    if (name === 'Cost') return [`$${num.toLocaleString()}`, 'Treatment Cost'];
                    return [`${num} yrs`, 'Patient Age'];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Scatter name="Nominal Admissions" data={anomalyScatterNormal} fill="#789681" fillOpacity={0.65} />
                <Scatter name="Statistical Outliers" data={anomalyScatterOutliers} fill="#B53838" fillOpacity={0.85} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 xl:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-[16px] font-semibold text-[#202923]">
                  Department Volume & Cost Profile
                </h2>
                <p className="text-[13px] text-[#5A665E] mt-0.5">
                  Top clinical units in the active dataset.
                </p>
              </div>
              <ShieldCheck className="w-4 h-4 text-[#789681]" />
            </div>

            <div className="h-[235px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={activeReport.departmentStats.slice(0, 7)}
                  margin={{ top: 4, right: 8, left: -12, bottom: 24 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(32, 41, 35, 0.07)" vertical={false} />
                  <XAxis
                    dataKey="department"
                    angle={-24}
                    textAnchor="end"
                    interval={0}
                    tick={{ fill: '#202923', fontSize: 10 }}
                    axisLine={{ stroke: 'rgba(32,41,35,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#5A665E', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="recordCount" name="Patient Admissions" radius={[6, 6, 0, 0]} barSize={22}>
                    {activeReport.departmentStats.slice(0, 7).map((entry, idx) => (
                      <Cell key={entry.department} fill={idx % 2 === 0 ? '#789681' : '#A2BDB0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pt-3 mt-2 border-t border-[#202923]/8 flex items-center justify-between text-[12px] text-[#5A665E]">
            <span>Source fingerprint</span>
            <span className="font-mono tabular-nums text-[#202923]">{dataset.originalHash.slice(0, 14)}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
