# Research at Columbia University

Harshit spent time at Columbia doing computational biology research on transcription factor binding preferences and genomics analysis.

**Transcription Factor Binding Analysis with PyProBound.** He configured PyProBound, a PyTorch-based binding model, to model 20 to 25 transcription factors across hundreds of ENCODE ChIP-seq datasets. The investigation tested whether TF binding preferences and cofactor interactions could be derived from ChIP-seq data as an alternative to the standard SELEX approach.

**Automated Genomics Pipeline.** Built end-to-end Snakemake pipelines that automated the full analysis workflow: FASTQ quality control with FastQC and Trimmomatic, alignment with BWA, peak calling with MACS2, post-processing with Samtools and BEDtools, and downstream PyProBound analysis.

**DNaseI Binding Analysis.** Inferred DNA binding preferences of the DNaseI enzyme through statistical analysis of two million DNase-seq fragments.

**HPC Parallelization.** Parallelized genomics workloads across an HPC cluster using Python multiprocessing, reducing per-job runtimes from hours to minutes.

Technologies used: PyProBound, Snakemake, Python, R, BWA, MACS2, Samtools, BEDtools, Trimmomatic, FastQC, HPC/Slurm, ENCODE, ChIP-seq, DNase-seq.
