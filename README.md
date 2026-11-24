# MediClean — Healthcare Data Governance and Cleaning Platform

MediClean is a clinical data governance, quality assessment, automated cleaning, validation, and audit platform designed for hospitals and healthcare organizations to maintain accurate, consistent, HIPAA-aligned patient datasets.

## Core Capabilities

1. **Healthcare Dataset Ingestion (`Upload Dataset`)**
   - Supports `.csv`, `.xlsx`, and `.xls` clinical file uploads with graceful validation and error handling.
   - Includes 3 realistic synthetic healthcare datasets (1,050–1,200 fictional patient records each) engineered with controlled data-quality defects.
   - Automatic schema profiling, inferred data types, completeness metrics, and HIPAA Safe Harbor sensitivity classification.
   - Preserves original source datasets immutably with SHA-256 verification.

2. **Data Quality Assessment (`Data Quality Assessment`)**
   - Automatically detects all 10 clinical data-quality categories: Missing Values, Duplicate Records, Invalid Emails, Invalid Phone Numbers, Invalid Dates (including reversed Discharge < Admission), Inconsistent Gender, Invalid Ages, Invalid MRN Identifiers, Inconsistent Department Names, and Numerical Outliers (Z-score > 3.0 & IQR fences).
   - Computes a transparent weighted 5-pillar quality score (Completeness, Uniqueness, Validity, Consistency, Integrity).

3. **Automated Data Cleaning (`Data Cleaning`)**
   - Interactive pre-execution dry-run preview showing exact projected row/cell impacts and cell-level Before/After diffs before committing changes.
   - Configurable missing-value imputation/placeholders, deduplication, ISO-8601 date standardization, reversed-date repair, text/MRN normalization, data-type coercion, contact format standardization, categorical/ICD-10 taxonomy alignment, and outlier Winsorization or audit flagging (`_Data_Quality_Flag`).

4. **Healthcare Data Governance & Privacy (`Governance and Privacy`)**
   - Automatic PII/PHI column classification (`Direct Identifier (PHI)`, `Quasi-Identifier`, `Clinical Sensitive`, `Operational`).
   - Masking enabled by default across all tables, diagnostics, and exports.
   - Role-Based Access Control (RBAC) across `Privacy Officer`, `Data Steward`, `Clinical Analyst`, and `Compliance Auditor`.
   - Immutable SQLite-backed audit log with server-side PII redaction and integrity hashing.

5. **Clinical Validation Suite (`Validation Results`)**
   - Declarative expectation rules covering Patient Age bounds, Admission/Discharge chronology, MRN regex (`MRN-XXXXXX`), canonical Gender categories, ICD-10-CM Diagnosis Codes, Hospital Department taxonomy, and Mandatory Patient Fields.
   - Per-rule pass/fail breakdowns and masked failing-record inspection.

6. **Interactive Analytics Dashboard (`Dashboard`)**
   - Live-computed KPIs, Issues by Category comparison, Before-vs-After Quality Dimensions, Statistical Billing Anomaly Detection scatter plot, and Department admission profiles.

7. **Reports, Export & SQLite History (`Reports and History`)**
   - Export cleaned datasets as `.csv` or `.xlsx` (with optional HIPAA Safe Harbor masking), printable HTML Executive Governance Reports, structured JSON reports, and Validation CSVs.
   - Side-by-side Original vs. Cleaned comparison explorer and persistent SQLite processing run history.

## Project Structure

- `server.ts` & `server/db.ts` — Express API and persistent SQLite database (`data/mediclean.sqlite`) for processing runs, immutable audit logs, and governance policies.
- `src/engine/syntheticGenerator.ts` — Deterministic synthetic healthcare dataset generator (1,000+ fictional records).
- `src/engine/qualityAssessor.ts` — 10-category quality assessment and statistical outlier detection engine.
- `src/engine/dataCleaner.ts` — Configurable non-destructive data cleaning pipeline with dry-run cell diffing.
- `src/engine/validator.ts` — Declarative healthcare data validation suite.
- `src/engine/governance.ts` — RBAC permissions, HIPAA Safe Harbor PII detection, masking, and SHA-256 hashing.
- `src/engine/exporter.ts` — CSV/Excel upload parser and multi-format report/dataset export utilities.
- `src/components/` — Modular Premium Glassmorphism UI pages (`Layout`, `DashboardView`, `UploadView`, `QualityView`, `CleaningView`, `GovernanceView`, `ValidationView`, `ReportsView`).

## Running Locally

```bash
npm install
npm run dev
```

For production builds:

```bash
npm run build
npm start
```
