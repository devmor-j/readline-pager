# Changelog

## v0.8.0

- [*Feature*]: Pager now implements `Symbol.asyncDispose` and `Symbol.dispose`, enabling automatic cleanup with `await using` and `using` syntax.
- [*Fix*]: Resolved `FileHandle` GC warnings in Node.js v26 by ensuring proper file handle cleanup in sync iteration and read loops.

## v0.7.0 — v0.7.3

- [*Feature*]: Added `output` option — pages can now be returned as raw `Buffer` objects instead of string arrays.
- [*Feature*]: Added madvise hints for I/O prediction.
- [*Fix*]: Fixed native backward reading bugs, including the ending delimiter bug.
- [*Fix*]: Improved error handling and stability in the native addon.
- [*Fix*]: Fixed native addon path resolution.
- [*Fix*]: Named types are now properly exported.
- [*Refactor*]: The `"array"` output mode has been renamed to `"string"`.
- [*Refactor*]: Removed `tryNative` option and the worker-based reader (high overhead).

## v0.5.0 — v0.6.5

- [*Feature*]: Implemented backward reading in the native C++ addon.
- [*Feature*]: Added `tryNative` option to fall back to JS reader when native is unavailable.
- [*Feature*]: Added ARM64 native module builds.
- [*Refactor*]: Enhanced TypeScript types and cleanup across readers.

## v0.4.1 — v0.4.10

- [*Feature*]: Native module is now required (x86 AVX2 or ARM NEON). Removed CPU feature detection fallback.
- [*Feature*]: Platform and CPU architecture detected automatically — dropped explicit Darwin and Win32 native builds.
- [*Fix*]: Fixed a bug where consecutive `next()` calls could return incorrect results.

## v0.3.0

- [*Feature*]: Introduced a native C++ pager using N-API for ~6× performance improvement.
- [*Feature*]: Added `nextSync()` method and `Symbol.iterator` support for synchronous reading.
- [*Feature*]: Implemented a true prefetch loop with configurable ring buffer queue (default prefetch increased to 8).
- [*Fix*]: Fixed empty line skipping in both forward and backward readers.
- [*Fix*]: Fixed extra empty last line per page.
- [*Refactor*]: Removed `lineCount`, `firstLine`, and `lastLine` properties.

## v0.2.0 — v0.2.7

- Initial release with JavaScript pager, forward/backward reading, and async iteration.
- [*Feature*]: Added `chunkSize` option and default export.
- [*Fix*]: Fixed `close()` unresolved promise bug and worker file path resolution.
