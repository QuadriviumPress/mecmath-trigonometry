#!/bin/bash
latex trigbook.tex
makeindex -s myindex.ist -o trigbook.ind trigbook.idx
latex trigbook.tex
makeindex trigbook.nlo -s nomencl.ist -o trigbook.nls
latex trigbook.tex
latex trigbook.tex
dvips -Ppdf -t letter -G0 -z trigbook.dvi -o
ps2pdf14 -dMaxSubsetPct=100 -dSubsetFonts=true -dEmbedAllFonts=true -dPDFSETTINGS=/printer -dCompatibilityLevel=1.4 -dUseCIEColor=true trigbook.ps
