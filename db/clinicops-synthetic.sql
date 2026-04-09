-- Synthetic FHIR-inspired dataset for the ClinicOps Copilot demo.
-- Tables are intentionally denormalized for demo simplicity.
-- All patient names, sample IDs, and metrics are fake.
--
-- Apply with:
--   npx wrangler d1 execute hgz-portfolio-db --remote --file=./db/clinicops-synthetic.sql

DROP TABLE IF EXISTS clinicops_samples;
DROP TABLE IF EXISTS clinicops_patients;
DROP TABLE IF EXISTS clinicops_pipeline_runs;

CREATE TABLE clinicops_patients (
	patient_id TEXT PRIMARY KEY,
	mrn TEXT NOT NULL,
	age INTEGER,
	sex TEXT,
	diagnosis TEXT,
	enrolled_at INTEGER NOT NULL
);

CREATE TABLE clinicops_samples (
	sample_id TEXT PRIMARY KEY,
	patient_id TEXT NOT NULL,
	assay TEXT NOT NULL,
	collected_at INTEGER NOT NULL,
	received_at INTEGER,
	qc_started_at INTEGER,
	qc_completed_at INTEGER,
	reported_at INTEGER,
	current_stage TEXT NOT NULL,
	qc_status TEXT,
	coverage_depth INTEGER,
	duplication_rate REAL,
	on_target_rate REAL,
	flags TEXT,
	FOREIGN KEY (patient_id) REFERENCES clinicops_patients(patient_id)
);

CREATE INDEX idx_clinicops_samples_stage ON clinicops_samples(current_stage);
CREATE INDEX idx_clinicops_samples_collected ON clinicops_samples(collected_at);

CREATE TABLE clinicops_pipeline_runs (
	run_id TEXT PRIMARY KEY,
	sample_id TEXT NOT NULL,
	pipeline_name TEXT NOT NULL,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	status TEXT NOT NULL,
	error_message TEXT,
	FOREIGN KEY (sample_id) REFERENCES clinicops_samples(sample_id)
);

-- ======================================================
-- Synthetic patients (20)
-- ======================================================
INSERT INTO clinicops_patients (patient_id, mrn, age, sex, diagnosis, enrolled_at) VALUES
	('PAT-00001', 'MRN-842001', 62, 'F', 'Breast adenocarcinoma, stage III', 1735689600),
	('PAT-00002', 'MRN-842002', 71, 'M', 'NSCLC, stage IV', 1735776000),
	('PAT-00003', 'MRN-842003', 58, 'F', 'Ovarian carcinoma, BRCA+', 1735862400),
	('PAT-00004', 'MRN-842004', 47, 'M', 'Colorectal, KRAS G12C', 1735948800),
	('PAT-00005', 'MRN-842005', 69, 'F', 'Pancreatic, BRCA2', 1736035200),
	('PAT-00006', 'MRN-842006', 55, 'M', 'Melanoma, BRAF V600E', 1736121600),
	('PAT-00007', 'MRN-842007', 63, 'F', 'Breast adenocarcinoma, HER2+', 1736208000),
	('PAT-00008', 'MRN-842008', 52, 'M', 'Prostate, stage II', 1736294400),
	('PAT-00009', 'MRN-842009', 39, 'F', 'AML, FLT3-ITD', 1736380800),
	('PAT-00010', 'MRN-842010', 74, 'M', 'CLL', 1736467200),
	('PAT-00011', 'MRN-842011', 48, 'F', 'Ovarian, platinum resistant', 1736553600),
	('PAT-00012', 'MRN-842012', 66, 'M', 'NSCLC, EGFR L858R', 1736640000),
	('PAT-00013', 'MRN-842013', 59, 'F', 'Breast, triple negative', 1736726400),
	('PAT-00014', 'MRN-842014', 72, 'M', 'Bladder, muscle invasive', 1736812800),
	('PAT-00015', 'MRN-842015', 51, 'F', 'Ovarian, germline BRCA1', 1736899200),
	('PAT-00016', 'MRN-842016', 68, 'M', 'Colorectal, BRAF V600E', 1736985600),
	('PAT-00017', 'MRN-842017', 43, 'F', 'AML, NPM1+', 1737072000),
	('PAT-00018', 'MRN-842018', 57, 'M', 'Cholangiocarcinoma, IDH1', 1737158400),
	('PAT-00019', 'MRN-842019', 64, 'F', 'Breast, HER2+ stage II', 1737244800),
	('PAT-00020', 'MRN-842020', 70, 'M', 'NSCLC, KRAS G12C', 1737331200);

-- ======================================================
-- Synthetic samples with realistic lifecycle states
-- Stages: accessioning, extraction, library_prep, sequencing, qc, analysis, reported, failed
-- ======================================================
INSERT INTO clinicops_samples
	(sample_id, patient_id, assay, collected_at, received_at, qc_started_at, qc_completed_at, reported_at, current_stage, qc_status, coverage_depth, duplication_rate, on_target_rate, flags)
VALUES
	-- 8 fully reported samples
	('SAM-100001', 'PAT-00001', 'NorthStar Select', 1738108800, 1738195200, 1738454400, 1738540800, 1738713600, 'reported', 'pass', 2150, 0.12, 0.89, NULL),
	('SAM-100002', 'PAT-00002', 'NorthStar Response', 1738195200, 1738281600, 1738540800, 1738627200, 1738800000, 'reported', 'pass', 1840, 0.18, 0.87, NULL),
	('SAM-100003', 'PAT-00003', 'NorthStar Select', 1738281600, 1738368000, 1738627200, 1738713600, 1738886400, 'reported', 'pass', 2280, 0.10, 0.91, NULL),
	('SAM-100004', 'PAT-00004', 'NorthStar Select', 1738368000, 1738454400, 1738713600, 1738800000, 1738972800, 'reported', 'pass', 2420, 0.09, 0.92, NULL),
	('SAM-100005', 'PAT-00005', 'NorthStar Response', 1738454400, 1738540800, 1738800000, 1738886400, 1739059200, 'reported', 'pass', 1950, 0.16, 0.88, NULL),
	('SAM-100006', 'PAT-00006', 'NorthStar Select', 1738540800, 1738627200, 1738886400, 1738972800, 1739145600, 'reported', 'pass', 2100, 0.13, 0.90, NULL),
	('SAM-100007', 'PAT-00007', 'NorthStar Select', 1738627200, 1738713600, 1738972800, 1739059200, 1739232000, 'reported', 'pass', 2310, 0.11, 0.91, NULL),
	('SAM-100008', 'PAT-00008', 'NorthStar Response', 1738713600, 1738800000, 1739059200, 1739145600, 1739318400, 'reported', 'pass', 1720, 0.19, 0.85, NULL),
	-- 4 samples in analysis stage
	('SAM-100009', 'PAT-00009', 'NorthStar Select', 1738886400, 1738972800, 1739232000, 1739318400, NULL, 'analysis', 'pass', 2080, 0.14, 0.89, NULL),
	('SAM-100010', 'PAT-00010', 'NorthStar Select', 1738972800, 1739059200, 1739318400, 1739404800, NULL, 'analysis', 'pass', 2190, 0.12, 0.90, NULL),
	('SAM-100011', 'PAT-00011', 'NorthStar Response', 1739059200, 1739145600, 1739404800, 1739491200, NULL, 'analysis', 'pass', 1880, 0.17, 0.87, NULL),
	('SAM-100012', 'PAT-00012', 'NorthStar Select', 1739145600, 1739232000, 1739491200, 1739577600, NULL, 'analysis', 'pass', 2220, 0.11, 0.91, NULL),
	-- 5 samples stuck in QC (critical: >3 days in this stage)
	('SAM-100013', 'PAT-00013', 'NorthStar Select', 1737936000, 1738022400, 1738281600, NULL, NULL, 'qc', 'review', 1680, 0.22, 0.82, 'low_coverage'),
	('SAM-100014', 'PAT-00014', 'NorthStar Select', 1738022400, 1738108800, 1738368000, NULL, NULL, 'qc', 'review', 1590, 0.25, 0.80, 'high_duplication'),
	('SAM-100015', 'PAT-00015', 'NorthStar Response', 1738108800, 1738195200, 1738454400, NULL, NULL, 'qc', 'review', 1720, 0.21, 0.83, 'off_target'),
	('SAM-100016', 'PAT-00016', 'NorthStar Select', 1738195200, 1738281600, 1738540800, NULL, NULL, 'qc', 'review', 1620, 0.24, 0.81, 'low_coverage'),
	('SAM-100017', 'PAT-00017', 'NorthStar Response', 1738281600, 1738368000, 1738627200, NULL, NULL, 'qc', 'review', 1550, 0.26, 0.79, 'low_coverage,high_duplication'),
	-- 3 samples failed
	('SAM-100018', 'PAT-00018', 'NorthStar Select', 1737849600, 1737936000, 1738195200, 1738281600, NULL, 'failed', 'fail', 820, 0.42, 0.68, 'insufficient_coverage'),
	('SAM-100019', 'PAT-00019', 'NorthStar Select', 1737936000, 1738022400, 1738281600, 1738368000, NULL, 'failed', 'fail', 940, 0.38, 0.70, 'contamination_suspected'),
	('SAM-100020', 'PAT-00020', 'NorthStar Response', 1738022400, 1738108800, 1738368000, 1738454400, NULL, 'failed', 'fail', 1120, 0.35, 0.72, 'library_dropout'),
	-- 8 fresh samples in early stages
	('SAM-100021', 'PAT-00001', 'NorthStar Select', 1739232000, 1739318400, NULL, NULL, NULL, 'extraction', NULL, NULL, NULL, NULL, NULL),
	('SAM-100022', 'PAT-00002', 'NorthStar Response', 1739318400, 1739404800, NULL, NULL, NULL, 'library_prep', NULL, NULL, NULL, NULL, NULL),
	('SAM-100023', 'PAT-00003', 'NorthStar Select', 1739404800, 1739491200, NULL, NULL, NULL, 'library_prep', NULL, NULL, NULL, NULL, NULL),
	('SAM-100024', 'PAT-00004', 'NorthStar Select', 1739491200, 1739577600, NULL, NULL, NULL, 'sequencing', NULL, NULL, NULL, NULL, NULL),
	('SAM-100025', 'PAT-00005', 'NorthStar Response', 1739577600, 1739664000, NULL, NULL, NULL, 'sequencing', NULL, NULL, NULL, NULL, NULL),
	('SAM-100026', 'PAT-00006', 'NorthStar Select', 1739664000, 1739750400, NULL, NULL, NULL, 'accessioning', NULL, NULL, NULL, NULL, NULL),
	('SAM-100027', 'PAT-00007', 'NorthStar Select', 1739750400, 1739836800, NULL, NULL, NULL, 'accessioning', NULL, NULL, NULL, NULL, NULL),
	('SAM-100028', 'PAT-00008', 'NorthStar Response', 1739836800, 1739923200, NULL, NULL, NULL, 'accessioning', NULL, NULL, NULL, NULL, NULL);

-- ======================================================
-- Pipeline runs (operational event log)
-- ======================================================
INSERT INTO clinicops_pipeline_runs (run_id, sample_id, pipeline_name, started_at, completed_at, status, error_message) VALUES
	('RUN-00001', 'SAM-100001', 'nf-core/demultiplex', 1738281600, 1738368000, 'success', NULL),
	('RUN-00002', 'SAM-100001', 'nf-core/sarek', 1738368000, 1738454400, 'success', NULL),
	('RUN-00003', 'SAM-100013', 'nf-core/demultiplex', 1738108800, 1738195200, 'success', NULL),
	('RUN-00004', 'SAM-100013', 'nf-core/sarek', 1738195200, 1738281600, 'success', NULL),
	('RUN-00005', 'SAM-100013', 'variant-validation', 1738281600, 1738368000, 'flagged', 'low coverage, manual review'),
	('RUN-00006', 'SAM-100018', 'nf-core/demultiplex', 1738022400, 1738108800, 'success', NULL),
	('RUN-00007', 'SAM-100018', 'nf-core/sarek', 1738108800, 1738195200, 'failed', 'insufficient on-target coverage (820x)'),
	('RUN-00008', 'SAM-100019', 'nf-core/demultiplex', 1738108800, 1738195200, 'success', NULL),
	('RUN-00009', 'SAM-100019', 'nf-core/sarek', 1738195200, 1738281600, 'failed', 'contamination suspected (off-target 0.70)'),
	('RUN-00010', 'SAM-100020', 'nf-core/demultiplex', 1738195200, 1738281600, 'success', NULL),
	('RUN-00011', 'SAM-100020', 'nf-core/sarek', 1738281600, 1738368000, 'failed', 'library dropout detected');
