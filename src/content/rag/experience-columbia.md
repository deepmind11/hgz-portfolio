# Experience: Computational Biologist — Columbia University

From January 2023 to October 2024, Harshit worked as a Computational Biologist at Columbia University in New York. He was in the lab of Principal Investigator Harmen Bussemaker in the Department of Biological Sciences, focused on transcription factor biology and genomics analysis.

**Transcription Factor Binding Analysis with PyProBound.** Analyzed the multi-layer biophysical architecture of PyProBound, a PyTorch-based modeling framework. He configured binding modes, cooperative cofactor interactions, and dinucleotide dependencies to model 20 to 25 transcription factors across hundreds of ENCODE ChIP-seq datasets. The investigation tested whether TF binding preferences and cofactor interactions could be derived from ChIP-seq data as an alternative to the standard SELEX approach. The work identified a 20% difference in binding preferences across chromosomes for certain transcription factors.

**Automated Genomics Pipeline.** Built end-to-end Snakemake pipelines that automated the full analysis workflow: FASTQ quality control with FastQC and Trimmomatic, alignment with BWA, peak calling with MACS2, post-processing with Samtools and BEDtools, and downstream PyProBound analysis. The automation reduced project management time by 90 percent.

**DNaseI Binding Analysis.** Inferred DNA binding preferences of the DNaseI enzyme through statistical analysis of two million DNase-seq fragments.

**HPC Parallelization.** Achieved 100% CPU utilization on an HPC cluster by parallelizing genomics workloads across 50 plus threads using Python multiprocessing, reducing per-job runtimes from hours to minutes. This maximized throughput on shared compute resources and enabled analyses that were previously impractical due to runtime constraints.

Technologies used: PyProBound (PyTorch-based), Snakemake, Python, R, BWA, MACS2, Samtools, BEDtools, Trimmomatic, FastQC, HPC/Slurm clusters, Matplotlib, REST APIs, ENCODE, SRA, ChIP-seq, DNase-seq, NGS analysis.
