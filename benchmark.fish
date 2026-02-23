#!/bin/fish

set lines 1000 1000000 10000000
set pageSizes 1 100 1000
set prefetch 1

set cmds

for l in $lines
    for s in $pageSizes
        for p in $prefetch
            set cmds $cmds "node test/benchmark.ts --lines=$l --page-size=$s --prefetch=$p"
        end
    end
end

hyperfine $cmds >benchmark_report.txt
