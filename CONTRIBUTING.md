# Contributing to `readline-pager`

Thanks for your interest in contributing.

## 📋 Requirements

- Minimum supported Node.js: **>= 18.12**
- Recommended dev environment: Node.js v25.x
- TypeScript 6.x

## 🚀 Getting Started

Install dependencies and run tests:

```bash
npm i
npm test
```

Tests run using the built-in Node test runner with coverage enabled.

---

## 📂 Project Structure

- `src/main.ts` — pager factory
- `src/reader/` — readers engine for forward and backward
- `src/native.ts` — native pager factory
- `src/native/pager.native.cc` — native reader engine implemented in C++ (forward and backward)
- `test/` — test files and benchmark tools with some utils only for tests

---

## ⚠️ Important Notes

- `pageSize` controls how many lines are returned per page.
- `chunkSize` strongly affects performance and should be tuned per environment.
- `prefetch` controls internal buffering of pages.
- Native mode (`createNativePager`) supports only single-character delimiters and a limited subset of options.
- The async iterator (`for await...of`) and manual iteration (`next()`) are both supported; manual iteration may provide more control in some cases.

---

## 🏠 Native (C++) Architecture Notes

This N-API module relies on C++23 features to optimize high-throughput file reading.

- **I/O & Memory:** Uses `mmap` and `madvise` for zero-copy forward reads. Backward reads must allocate new memory to aggregate reversed segments.
- **SIMD Vectorization:** Runtime CPU detection routes delimiter scanning to AVX2 or NEON paths, processing 64KB blocks against a single-byte delimiter.
- **Concurrency:** A background `std::jthread` feeds a bounded, power-of-two ring buffer using `std::atomic` variables, a mutex, and a condition variable.
- **Lifecycle Management:** Atomic reference counting bridges the N-API async workers, the background thread, and V8 garbage collection finalizers.

---

## 🌿 Pull Requests

Please follow these guidelines:

- Keep changes small and focused
- Ensure all tests pass (keep lines coverage above 90%)
- Add or update tests for any new behavior
- Do not introduce external dependencies
- Maintain the existing API shape unless a change is discussed in an issue first
- Avoid breaking changes without strong justification
- Must work for both ESM and CommonJS users.

## 🐛 Reporting Issues

When opening an issue, include:

- Node.js version
- Operating system
- Minimal reproduction steps
- Expected vs actual behavior
- Relevant code snippet or file sample

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.
