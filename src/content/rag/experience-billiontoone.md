# Experience: Bioinformatics Associate, Oncology — BillionToOne Inc

From November 2024 to March 2026, Harshit worked as a Bioinformatics Associate in Oncology at BillionToOne Inc in Menlo Park, California. BillionToOne is a molecular diagnostics company developing quantitative molecular counting technology for prenatal testing and oncology, operating under CAP/CLIA accreditation and New York State Department of Health (NYSDOH) regulations.

He worked on two oncology assays: NorthStar Select, a hybrid-capture cfDNA variant detection assay using unique molecular identifiers (UMI), and NorthStar Response, a methylation-based cancer monitoring assay using multiplex PCR following bisulfite conversion.

Key contributions:

**Automated Variant Validation System.** Built an automated variant validation system using PySAM and BAM-level alignment analysis to verify VarDict indel calls. The system catches 100% of false positive calls without affecting assay sensitivity. It processes 100 to 150 variants per week and filters approximately half as false positives. This eliminated 10 to 20 hours per week of manual IGV review for the Variant Interpretation team, scaling to hundreds of hours saved annually.

**Sample Dwell Check Monitoring System.** Engineered an automated sample lifecycle tracking system on AWS using Lambda, EventBridge, and Terraform. It monitors over 600 samples per day across bioinformatics and lab databases (BI database and LabIt LIMS), identifying samples stalled at any pipeline step and sending daily Slack notifications. It catches 15 to 20 at-risk samples per week, preventing patient samples from falling through operational gaps in a clinical diagnostics environment.

**AI-Powered Sample Query Chatbot.** Built an agentic AI system on AWS Bedrock that lets QA, Medical Science Liaisons, and Variant Interpretation teams query sample status in natural language. The chatbot retrieves QC metrics from BI databases and generates structured diagnostic hypotheses about sample issues, reducing the cross-team operational burden on bioinformatics by enabling self-service troubleshooting.

**Automated Plot Labeling System.** Engineered an automated labeling system in Plotly that solved a constrained NP-hard Point-Feature Label Placement problem the team believed could not be automated. This eliminated manual plot review from operational workflows, enabling fully automated QC plot generation for clinical teams.

**Production Pipeline Operations.** Optimized Nextflow-based production pipelines processing over 2,000 patient samples per week on AWS Batch. Served as subject matter expert for the NorthStar Response Assay pipeline, onboarding two team members including his direct manager. Managed QC review, batch failure troubleshooting, sample swap investigation, and report verification.

**Cross-functional coordination.** Provided operational status updates and troubleshooting support across five-plus teams: wet lab, clinical operations (Variant Interpretation), QA, regulatory, and R&D. Interfaced with Medical Science Liaisons for sample status inquiries and escalations.

Technologies used: Nextflow, Python, PySAM, Plotly, Jupyter Notebooks, AWS (S3, Batch, Lambda, Fargate, EventBridge, ECR, Bedrock), Terraform, Docker, VarDict, Slack API, LIMS (LabIt), Epic EMR integration, cell-free DNA analysis, BAM/BED file analysis, IGV, hybrid capture with UMI, bisulfite sequencing.
