import React, { useState } from 'react';
import { CheckCircle2, Download, Play, XCircle } from 'lucide-react';
import type {
  DatasetState,
  GovernancePolicy,
  ValidationRuleConfig,
  ValidationRuleResult,
  ValidationSuiteReport,
} from '../types/mediclean';
import { maskCellValue, maskPatientId } from '../engine/governance';
import { exportValidationResultsCsv } from '../engine/exporter';

interface ValidationViewProps {
  dataset: DatasetState;
  policy: GovernancePolicy;
  allowUnmask: boolean;
  config: ValidationRuleConfig;
  onConfigChange: (next: ValidationRuleConfig) => void;
  report: ValidationSuiteReport;
  onRunValidation: (target: 'original' | 'cleaned', config: ValidationRuleConfig) => Promise<void>;
}

export const ValidationView: React.FC<ValidationViewProps> = ({
  dataset,
  policy,
  allowUnmask,
  config,
  onConfigChange,
  report,
  onRunValidation,
}) => {
  const [selectedRuleId, setSelectedRuleId] = useState<string>(report.rules[0]?.ruleId || '');
  const [target, setTarget] = useState<'original' | 'cleaned'>(report.target);

  const selectedRule: ValidationRuleResult | undefined =
    report.rules.find((r) => r.ruleId === selectedRuleId) ?? report.rules[0];

  const handleRun = async (nextTarget: 'original' | 'cleaned') => {
    setTarget(nextTarget);
    await onRunValidation(nextTarget, config);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[#202923]">
            Clinical Data Validation Suite
          </h1>
          <p className="text-[14px] text-[#5A665E] mt-1">
            Declarative expectation checks covering age bounds, admission/discharge chronology, MRN regex, gender sets, ICD-10 codes, department taxonomy, and mandatory fields.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => exportValidationResultsCsv(report, dataset.name)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/80 hover:bg-white border border-[#202923]/12 text-[13px] font-medium text-[#202923] whitespace-nowrap transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Results CSV</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRun(dataset.cleanedRows && target === 'cleaned' ? 'cleaned' : target)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4A6A55] hover:bg-[#385342] text-white text-[13px] font-medium whitespace-nowrap transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>Re-Run Validation Suite</span>
          </button>
        </div>
      </div>

      {/* Target Selector + Suite Summary */}
      <section className="glass-panel p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[12px] text-[#5A665E]">Overall Expectation Pass Rate</div>
            <div className="mt-0.5 font-mono tabular-nums text-[28px] font-semibold text-[#202923]">
              {report.overallPassRate.toFixed(1)}%
            </div>
          </div>
          <div className="h-10 w-px bg-[#202923]/10 hidden sm:block" />
          <div>
            <div className="text-[12px] text-[#5A665E]">Rules Passed / Total</div>
            <div className="mt-0.5 font-mono tabular-nums text-[20px] font-semibold text-[#202923]">
              {report.passedRules} / {report.totalRules}
            </div>
          </div>
          <div className="h-10 w-px bg-[#202923]/10 hidden sm:block" />
          <div>
            <div className="text-[12px] text-[#5A665E]">Compliant Records</div>
            <div className="mt-0.5 font-mono tabular-nums text-[20px] font-semibold text-[#2B6B4F]">
              {report.passedRecordsCount.toLocaleString()}
            </div>
          </div>
          <div className="h-10 w-px bg-[#202923]/10 hidden sm:block" />
          <div>
            <div className="text-[12px] text-[#5A665E]">Records With Failures</div>
            <div className="mt-0.5 font-mono tabular-nums text-[20px] font-semibold text-[#B53838]">
              {report.failedRecordsCount.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-white/75 border border-[#202923]/8 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => void handleRun('original')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap ${
              report.target === 'original'
                ? 'bg-[#4A6A55] text-white'
                : 'text-[#5A665E] hover:text-[#202923]'
            }`}
          >
            Original Dataset
          </button>
          <button
            type="button"
            disabled={!dataset.cleanedRows}
            onClick={() => void handleRun('cleaned')}
            className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors whitespace-nowrap disabled:opacity-40 ${
              report.target === 'cleaned'
                ? 'bg-[#4A6A55] text-white'
                : 'text-[#5A665E] hover:text-[#202923]'
            }`}
          >
            Cleaned Dataset
          </button>
        </div>
      </section>

      {/* Rule Parameter Controls */}
      <section className="glass-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-[14px] font-semibold text-[#202923]">Validation Rule Parameters</div>
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#202923]">
            <label className="flex items-center gap-2">
              <span className="text-[#5A665E]">Min Age</span>
              <input
                type="number"
                value={config.minAge}
                min={0}
                max={100}
                onChange={(e) =>
                  onConfigChange({ ...config, minAge: Math.max(0, Number(e.target.value) || 0) })
                }
                className="w-16 h-8 px-2 rounded-lg bg-white border border-[#202923]/12 font-mono tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[#5A665E]">Max Age</span>
              <input
                type="number"
                value={config.maxAge}
                min={1}
                max={150}
                onChange={(e) =>
                  onConfigChange({ ...config, maxAge: Math.max(1, Number(e.target.value) || 120) })
                }
                className="w-16 h-8 px-2 rounded-lg bg-white border border-[#202923]/12 font-mono tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.strictMrnPattern}
                onChange={(e) => onConfigChange({ ...config, strictMrnPattern: e.target.checked })}
                className="accent-[#4A6A55]"
              />
              <span>Strict MRN-XXXXXX</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.strictIcd10Pattern}
                onChange={(e) => onConfigChange({ ...config, strictIcd10Pattern: e.target.checked })}
                className="accent-[#4A6A55]"
              />
              <span>Strict ICD-10-CM</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.requireCanonicalDepartment}
                onChange={(e) =>
                  onConfigChange({ ...config, requireCanonicalDepartment: e.target.checked })
                }
                className="accent-[#4A6A55]"
              />
              <span>Canonical Departments</span>
            </label>
          </div>
        </div>
      </section>

      {/* Expectations Results Table */}
      <section className="glass-panel p-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-[16px] font-semibold text-[#202923]">
              Expectation Suite Breakdown ({report.target === 'cleaned' ? 'Cleaned' : 'Original'})
            </h2>
            <p className="text-[13px] text-[#5A665E] mt-0.5">
              Select a validation rule row to inspect failed patient records below.
            </p>
          </div>
          <span className="text-[12px] font-mono tabular-nums text-[#5A665E]">
            Evaluated {new Date(report.executedAt).toLocaleTimeString()}
          </span>
        </div>

        <div className="surface-solid overflow-x-auto">
          <table className="w-full text-left border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[#202923]/8 text-[12px] text-[#5A665E] bg-[#F5F7F5]/65">
                <th className="py-2.5 px-4 font-medium">Validation Domain & Rule</th>
                <th className="py-2.5 px-4 font-medium">Expectation</th>
                <th className="py-2.5 px-4 font-medium text-right">Passed</th>
                <th className="py-2.5 px-4 font-medium text-right">Failed</th>
                <th className="py-2.5 px-4 font-medium text-right">Pass Rate</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#202923]/6">
              {report.rules.map((rule) => {
                const isSelected = selectedRule?.ruleId === rule.ruleId;
                return (
                  <tr
                    key={rule.ruleId}
                    onClick={() => setSelectedRuleId(rule.ruleId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#789681]/14' : 'hover:bg-[#789681]/6'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#202923]">{rule.ruleName}</div>
                      <div className="text-[11px] text-[#5A665E] mt-0.5">
                        {rule.domain} · Column: <span className="font-mono">{rule.column}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#5A665E]">
                      {rule.expectationType}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#2B6B4F]">
                      {rule.passedCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#B53838]">
                      {rule.failedCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#202923]">
                      {rule.passRate.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                          rule.status === 'Passed' ? 'text-[#2B6B4F]' : 'text-[#B53838]'
                        }`}
                      >
                        {rule.status === 'Passed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5" />
                        )}
                        {rule.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Failed Records Inspector */}
      {selectedRule && (
        <section className="glass-panel p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="text-[16px] font-semibold text-[#202923]">
                Rule Inspector — {selectedRule.ruleName}
              </h2>
              <p className="text-[13px] text-[#5A665E] mt-0.5">
                {selectedRule.failedCount === 0
                  ? 'All evaluated records passed this clinical validation rule.'
                  : `Showing up to 40 sample failing records out of ${selectedRule.failedCount.toLocaleString()} total failures (PHI masked).`}
              </p>
            </div>
          </div>

          {selectedRule.failedSamples.length === 0 ? (
            <div className="surface-solid py-10 px-6 text-center text-[14px] font-medium text-[#2B6B4F]">
              100% Compliance — Zero failed records detected for this expectation.
            </div>
          ) : (
            <div className="surface-solid overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-[#202923]/8 text-[#5A665E] bg-[#F5F7F5]/65">
                    <th className="py-2.5 px-4 font-medium">Row</th>
                    <th className="py-2.5 px-4 font-medium">Patient ID (Masked)</th>
                    <th className="py-2.5 px-4 font-medium">Observed Value</th>
                    <th className="py-2.5 px-4 font-medium">Failure Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#202923]/6">
                  {selectedRule.failedSamples.map((sample, idx) => (
                    <tr key={`${sample.rowIndex}-${idx}`} className="hover:bg-[#789681]/6">
                      <td className="py-2 px-4 font-mono tabular-nums text-[#78827B]">
                        {sample.rowIndex + 1}
                      </td>
                      <td className="py-2 px-4 font-mono tabular-nums text-[#202923]">
                        {allowUnmask ? sample.patientId : maskPatientId(sample.patientId)}
                      </td>
                      <td className="py-2 px-4 font-mono text-[#B53838]">
                        {maskCellValue(selectedRule.column, sample.value, policy, allowUnmask)}
                      </td>
                      <td className="py-2 px-4 text-[#5A665E]">{sample.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
