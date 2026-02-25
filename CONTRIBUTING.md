# Contributing to readline-pager

Thanks for your interest in contributing.

## Requirements

- Node.js **>= 18.12**
- Recommended dev environment: Node v25.x (used during development)
- TypeScript ~5.9.x

## Getting Started

```bash
npm ci
npm test
```

Tests run using the built-in Node test runner with coverage enabled.

---

## Project Structure

- `src/main.ts` — core pager implementation
  - forward reader
  - backward reader
  - worker integration

- `src/worker.ts` — forward reader running in a worker thread
- `test/` — coverage-focused unit tests
- `dist/` — compiled output (published)

---

## Design Principles

- Zero runtime dependencies
- Memory-efficient (never load full file)
- Page-based iteration (`string[]`)
- Async-first API
- Backward reading support
- Optional worker isolation
- Performance-oriented (minimal allocations in hot paths)

---

## Important Notes

- `pageSize` controls batching granularity.
- `prefetch` controls internal buffering depth.
- Worker mode supports **forward reading only**.
- Backward reading uses chunked reverse scanning with delimiter search.
- Async iterator syntax is supported, but `while + next()` is slightly faster in hot paths.

---

## Pull Requests

- Keep changes minimal and focused.
- Add tests for new behavior.
- Avoid introducing dependencies.
- Preserve ESM-only architecture.
- Ensure coverage does not regress.

If you’re improving performance, include benchmark numbers.
