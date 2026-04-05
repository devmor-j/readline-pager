#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <mutex>
#include <node_api.h>
#include <stop_token>
#include <sys/mman.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>

#if defined(__x86_64__) || defined(__i386__)
#include <immintrin.h>
#elif defined(__aarch64__) || defined(__arm__)
#include <arm_neon.h>
#endif

static constexpr size_t BLOCK_SIZE = 64 * 1024;

struct Segment {
  size_t start;
  size_t end;
};

struct PageItem {
  const char *data = nullptr;
  size_t length = 0;
  bool owned = false;
};

static constexpr size_t QUEUE_CAP = 8192;
static_assert((QUEUE_CAP & (QUEUE_CAP - 1)) == 0);

struct PagerState;
static inline bool queue_empty(const PagerState *st);
static inline bool queue_full(const PagerState *st);
static inline void queue_clear(PagerState *st);
static inline bool queue_push_item(PagerState *st, const PageItem &item);
static inline bool queue_pop_item(PagerState *st, PageItem &out);

struct PagerState {
  int fd = -1;
  size_t filesize = 0;
  const char *data = nullptr;
  size_t page_lines = 1000;
  unsigned char delimiter = '\n';
  bool backward = false;

  PageItem queue[QUEUE_CAP];
  std::atomic<size_t> head{0};
  std::atomic<size_t> tail{0};

  std::mutex mtx;
  std::condition_variable cv;

  std::atomic<bool> scan_finished{false};
  std::atomic<bool> aborted{false};

  std::atomic<uint32_t> refs{0};
  std::atomic<bool> external_finalized{false};
  std::atomic<bool> destroyed{false};

  std::jthread scanner_thread;

  void retain_ref() { refs.fetch_add(1, std::memory_order_acq_rel); }

  void release_ref() {
    if (refs.fetch_sub(1, std::memory_order_acq_rel) == 1)
      maybe_destroy();
  }

  void request_close() {
    aborted.store(true, std::memory_order_release);
    scan_finished.store(true, std::memory_order_release);

    if (scanner_thread.joinable())
      scanner_thread.request_stop();

    queue_clear(this);
    cv.notify_all();
  }

  void mark_external_finalized() {
    external_finalized.store(true, std::memory_order_release);
    maybe_destroy();
  }

  void maybe_destroy() {
    if (!external_finalized.load(std::memory_order_acquire))
      return;
    if (refs.load(std::memory_order_acquire) != 0)
      return;

    bool expected = false;
    if (destroyed.compare_exchange_strong(expected, true,
                                          std::memory_order_acq_rel)) {
      delete this;
    }
  }

  ~PagerState() {
    aborted.store(true, std::memory_order_release);
    scan_finished.store(true, std::memory_order_release);
    cv.notify_all();

    if (scanner_thread.joinable())
      scanner_thread.join();

    if (data && filesize > 0)
      munmap(const_cast<char *>(data), filesize);
  }
};

static inline bool queue_empty(const PagerState *st) {
  return st->tail.load(std::memory_order_acquire) ==
         st->head.load(std::memory_order_acquire);
}

static inline bool queue_full(const PagerState *st) {
  const size_t head = st->head.load(std::memory_order_acquire);
  const size_t next = (head + 1) & (QUEUE_CAP - 1);
  return next == st->tail.load(std::memory_order_acquire);
}

static inline void queue_clear(PagerState *st) {
  PageItem item;
  while (queue_pop_item(st, item)) {
    if (item.owned && item.data)
      free(const_cast<char *>(item.data));
  }
}

static inline bool queue_push_item(PagerState *st, const PageItem &item) {
  while (!st->aborted.load(std::memory_order_acquire)) {
    const size_t head = st->head.load(std::memory_order_acquire);
    const size_t next = (head + 1) & (QUEUE_CAP - 1);

    if (next != st->tail.load(std::memory_order_acquire)) {
      if (st->aborted.load(std::memory_order_acquire))
        return false;

      st->queue[head] = item;
      st->head.store(next, std::memory_order_release);
      st->cv.notify_one();
      return true;
    }

    std::unique_lock lk(st->mtx);
    st->cv.wait(lk, [&] {
      return st->aborted.load(std::memory_order_acquire) || !queue_full(st);
    });
  }

  return false;
}

static inline bool queue_pop_item(PagerState *st, PageItem &out) {
  const size_t tail = st->tail.load(std::memory_order_acquire);
  if (tail == st->head.load(std::memory_order_acquire))
    return false;

  out = st->queue[tail];
  st->tail.store((tail + 1) & (QUEUE_CAP - 1), std::memory_order_release);
  st->cv.notify_one();
  return true;
}

static void slice_buffer_finalize(napi_env env, void *data, void *hint) {
  (void)env;
  (void)data;
  auto *st = static_cast<PagerState *>(hint);
  if (st)
    st->release_ref();
}

static void owned_buffer_finalize(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  (void)data;
  free(data);
}

static void pager_external_finalize(napi_env env, void *data, void *hint) {
  (void)env;
  (void)hint;
  auto *st = static_cast<PagerState *>(data);
  if (!st)
    return;

  st->request_close();
  st->mark_external_finalized();
}

static inline bool create_page_value(napi_env env, PagerState *st,
                                     const PageItem &item, napi_value *out) {
  if (item.length == 0)
    return napi_create_buffer_copy(env, 0, nullptr, nullptr, out) == napi_ok;

  if (item.owned) {
    napi_status s = napi_create_external_buffer(
        env, item.length, const_cast<char *>(item.data), owned_buffer_finalize,
        nullptr, out);

    if (s != napi_ok) {
      free(const_cast<char *>(item.data));
      return false;
    }

    return true;
  }

  st->retain_ref();

  napi_status s = napi_create_external_buffer(env, item.length,
                                              const_cast<char *>(item.data),
                                              slice_buffer_finalize, st, out);

  if (s != napi_ok) {
    st->release_ref();
    return false;
  }

  return true;
}

static inline bool forward_consume_delim(PagerState *st, size_t pos,
                                         size_t &page_start, uint32_t &lines) {
  if (++lines >= st->page_lines) {
    if (pos >= page_start) {
      PageItem item{st->data + page_start, pos - page_start, false};
      if (!queue_push_item(st, item))
        return false;
    }
    page_start = pos + 1;
    lines = 0;
  }
  return true;
}

static inline void forward_finish(PagerState *st, size_t page_start,
                                  size_t size) {
  if (page_start < size) {
    PageItem item{st->data + page_start, size - page_start, false};
    queue_push_item(st, item);
    return;
  }

  if (size > 0 && st->data[size - 1] == static_cast<char>(st->delimiter)) {
    PageItem item{nullptr, 0, false};
    queue_push_item(st, item);
  }
}

static inline bool build_backward_page_item(PagerState *st,
                                            const Segment *segments,
                                            size_t count, PageItem &out) {
  size_t total = 0;
  for (size_t i = 0; i < count; ++i) {
    total += segments[i].end - segments[i].start;
    if (i + 1 < count)
      ++total;
  }

  if (total == 0) {
    out = {nullptr, 0, false};
    return true;
  }

  char *buf = static_cast<char *>(malloc(total));
  if (!buf) {
    st->aborted.store(true, std::memory_order_release);
    st->scan_finished.store(true, std::memory_order_release);
    st->cv.notify_all();
    return false;
  }

  char *dst = buf;
  for (size_t i = 0; i < count; ++i) {
    const size_t len = segments[i].end - segments[i].start;
    if (len > 0) {
      std::memcpy(dst, st->data + segments[i].start, len);
      dst += len;
    }

    if (i + 1 < count)
      *dst++ = static_cast<char>(st->delimiter);
  }

  out = {buf, total, true};
  return true;
}

static inline bool flush_backward_page(PagerState *st, const Segment *segments,
                                       size_t count) {
  if (count == 0)
    return true;

  PageItem item;
  if (!build_backward_page_item(st, segments, count, item))
    return false;

  if (!queue_push_item(st, item)) {
    if (item.owned && item.data)
      free(const_cast<char *>(item.data));
    return false;
  }

  return true;
}

static inline bool backward_consume_delim(PagerState *st, Segment *segments,
                                          size_t &segment_count,
                                          size_t &segment_end,
                                          size_t delim_pos) {
  segments[segment_count++] = Segment{delim_pos + 1, segment_end};
  segment_end = delim_pos;

  if (segment_count >= st->page_lines) {
    if (!flush_backward_page(st, segments, segment_count))
      return false;
    segment_count = 0;
  }

  return true;
}

#if defined(__x86_64__) || defined(__i386__)
__attribute__((target("avx2,bmi,lzcnt"))) static void
scan_forward(std::stop_token stop, PagerState *st) {
  const size_t size = st->filesize;
  const char *data = st->data;
  const __m256i needle = _mm256_set1_epi8(static_cast<char>(st->delimiter));

  size_t page_start = 0;
  uint32_t lines = 0;

  size_t block_begin = 0;
  while (block_begin < size && !stop.stop_requested() &&
         !st->aborted.load(std::memory_order_acquire)) {
    const size_t block_end = std::min(size, block_begin + BLOCK_SIZE);
    size_t i = block_begin;

    for (; i + 32 <= block_end && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire);
         i += 32) {
      const __m256i chunk =
          _mm256_loadu_si256(reinterpret_cast<const __m256i *>(data + i));
      uint32_t mask = static_cast<uint32_t>(
          _mm256_movemask_epi8(_mm256_cmpeq_epi8(chunk, needle)));

      while (mask) {
        const uint32_t bit = static_cast<uint32_t>(__builtin_ctz(mask));
        const size_t pos = i + bit;
        if (!forward_consume_delim(st, pos, page_start, lines))
          return;
        mask &= mask - 1;
      }
    }

    for (; i < block_end && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire);
         ++i) {
      if (data[i] == static_cast<char>(st->delimiter)) {
        if (!forward_consume_delim(st, i, page_start, lines))
          return;
      }
    }

    block_begin = block_end;
  }

  if (!st->aborted.load(std::memory_order_acquire))
    forward_finish(st, page_start, size);
}

__attribute__((target("avx2,bmi,lzcnt"))) static void
scan_backward(std::stop_token stop, PagerState *st) {
  const size_t size = st->filesize;
  const char *data = st->data;
  const __m256i needle = _mm256_set1_epi8(static_cast<char>(st->delimiter));

  const size_t cap = std::max<size_t>(st->page_lines, 1);
  Segment *segments = static_cast<Segment *>(malloc(sizeof(Segment) * cap));
  if (!segments) {
    st->aborted.store(true, std::memory_order_release);
    st->scan_finished.store(true, std::memory_order_release);
    st->cv.notify_all();
    return;
  }

  size_t segment_count = 0;
  size_t segment_end = size;
  size_t block_end = size;

  while (block_end > 0 && !stop.stop_requested() &&
         !st->aborted.load(std::memory_order_acquire)) {
    const size_t block_start =
        (block_end > BLOCK_SIZE) ? (block_end - BLOCK_SIZE) : 0;

    size_t i = block_end;

    while (i - block_start >= 32 && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire)) {
      i -= 32;

      const __m256i chunk =
          _mm256_loadu_si256(reinterpret_cast<const __m256i *>(data + i));

      uint32_t mask = static_cast<uint32_t>(
          _mm256_movemask_epi8(_mm256_cmpeq_epi8(chunk, needle)));

      while (mask) {
        const uint32_t bit = 31u - static_cast<uint32_t>(__builtin_clz(mask));
        const size_t pos = i + bit;

        if (!backward_consume_delim(st, segments, segment_count, segment_end,
                                    pos))
          goto done;

        mask &= ~(1u << bit);
      }
    }

    while (i > block_start && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire)) {
      --i;
      if (data[i] == static_cast<char>(st->delimiter)) {
        if (!backward_consume_delim(st, segments, segment_count, segment_end,
                                    i))
          goto done;
      }
    }

    block_end = block_start;
  }

  if (!st->aborted.load(std::memory_order_acquire)) {
    segments[segment_count++] = Segment{0, segment_end};

    if (segment_count >= st->page_lines) {
      if (!flush_backward_page(st, segments, segment_count))
        goto done;
      segment_count = 0;
    }

    if (segment_count > 0)
      flush_backward_page(st, segments, segment_count);
  }

done:
  free(segments);
}

#elif defined(__aarch64__) || defined(__arm__)

static void scan_forward(std::stop_token stop, PagerState *st) {
  const size_t size = st->filesize;
  const uint8_t *data = reinterpret_cast<const uint8_t *>(st->data);
  const uint8x16_t needle = vdupq_n_u8(st->delimiter);

  size_t page_start = 0;
  uint32_t lines = 0;

  size_t block_begin = 0;
  while (block_begin < size && !stop.stop_requested() &&
         !st->aborted.load(std::memory_order_acquire)) {
    const size_t block_end = std::min(size, block_begin + BLOCK_SIZE);
    size_t i = block_begin;

    for (; i + 16 <= block_end && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire);
         i += 16) {
      const uint8x16_t chunk = vld1q_u8(data + i);
      const uint8x16_t cmp = vceqq_u8(chunk, needle);
      const uint64x2_t lanes = vreinterpretq_u64_u8(cmp);

      if (vgetq_lane_u64(lanes, 0) || vgetq_lane_u64(lanes, 1)) {
        for (int b = 0; b < 16; ++b) {
          if (data[i + static_cast<size_t>(b)] == st->delimiter) {
            if (!forward_consume_delim(st, i + static_cast<size_t>(b),
                                       page_start, lines))
              return;
          }
        }
      }
    }

    for (; i < block_end && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire);
         ++i) {
      if (data[i] == static_cast<char>(st->delimiter)) {
        if (!forward_consume_delim(st, i, page_start, lines))
          return;
      }
    }

    block_begin = block_end;
  }

  if (!st->aborted.load(std::memory_order_acquire))
    forward_finish(st, page_start, size);
}

static void scan_backward(std::stop_token stop, PagerState *st) {
  const size_t size = st->filesize;
  const uint8_t *data = reinterpret_cast<const uint8_t *>(st->data);
  const uint8x16_t needle = vdupq_n_u8(st->delimiter);

  const size_t cap = std::max<size_t>(st->page_lines, 1);
  Segment *segments = static_cast<Segment *>(malloc(sizeof(Segment) * cap));
  if (!segments) {
    st->aborted.store(true, std::memory_order_release);
    st->scan_finished.store(true, std::memory_order_release);
    st->cv.notify_all();
    return;
  }

  size_t segment_count = 0;
  size_t segment_end = size;
  size_t block_end = size;

  while (block_end > 0 && !stop.stop_requested() &&
         !st->aborted.load(std::memory_order_acquire)) {
    const size_t block_start =
        (block_end > BLOCK_SIZE) ? (block_end - BLOCK_SIZE) : 0;

    size_t i = block_end;

    while (i - block_start >= 16 && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire)) {
      i -= 16;

      const uint8x16_t chunk = vld1q_u8(data + i);
      const uint8x16_t cmp = vceqq_u8(chunk, needle);
      const uint64x2_t lanes = vreinterpretq_u64_u8(cmp);

      if (vgetq_lane_u64(lanes, 0) || vgetq_lane_u64(lanes, 1)) {
        for (int b = 15; b >= 0; --b) {
          if (data[i + static_cast<size_t>(b)] == st->delimiter) {
            if (!backward_consume_delim(st, segments, segment_count,
                                        segment_end,
                                        i + static_cast<size_t>(b)))
              goto done;
          }
        }
      }
    }

    while (i > block_start && !stop.stop_requested() &&
           !st->aborted.load(std::memory_order_acquire)) {
      --i;
      if (data[i] == static_cast<char>(st->delimiter)) {
        if (!backward_consume_delim(st, segments, segment_count, segment_end,
                                    i))
          goto done;
      }
    }

    block_end = block_start;
  }

  if (!st->aborted.load(std::memory_order_acquire)) {
    segments[segment_count++] = Segment{0, segment_end};

    if (segment_count >= st->page_lines) {
      if (!flush_backward_page(st, segments, segment_count))
        goto done;
      segment_count = 0;
    }

    if (segment_count > 0)
      flush_backward_page(st, segments, segment_count);
  }

done:
  free(segments);
}

#else

static void scan_forward(std::stop_token stop, PagerState *st) {}
static void scan_backward(std::stop_token stop, PagerState *st) {}

#endif

static void background_scanner(std::stop_token stop, PagerState *st) {
  if (st->filesize == 0) {
    if (!st->aborted.load(std::memory_order_acquire)) {
      PageItem item{nullptr, 0, false};
      queue_push_item(st, item);
    }
    st->scan_finished.store(true, std::memory_order_release);
    st->cv.notify_all();
    return;
  }

  if (st->backward)
    scan_backward(stop, st);
  else
    scan_forward(stop, st);

  st->scan_finished.store(true, std::memory_order_release);
  st->cv.notify_all();
}

static napi_value Open(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value argv[5];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  char path[4096];
  size_t path_len = 0;
  napi_get_value_string_utf8(env, argv[0], path, sizeof(path), &path_len);

  uint32_t page_lines = 1000;
  if (argc >= 2)
    napi_get_value_uint32(env, argv[1], &page_lines);

  unsigned char delim = '\n';
  if (argc >= 3) {
    char dstr[8];
    size_t dlen = 0;
    napi_get_value_string_utf8(env, argv[2], dstr, sizeof(dstr), &dlen);
    if (dlen > 0)
      delim = static_cast<unsigned char>(dstr[0]);
  }

  bool backward = false;
  if (argc >= 4)
    napi_get_value_bool(env, argv[3], &backward);

  int fd = open(path, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    napi_throw_error(
        env, nullptr,
        "Failed to open file: file does not exist or cannot be read");
    return nullptr;
  }

#if defined(POSIX_FADV_SEQUENTIAL)
  (void)posix_fadvise(fd, 0, 0,
                      backward ? POSIX_FADV_RANDOM : POSIX_FADV_SEQUENTIAL);
#endif
#if defined(POSIX_FADV_WILLNEED)
  (void)posix_fadvise(fd, 0, 0, POSIX_FADV_WILLNEED);
#endif

  struct stat stbuf{};
  if (fstat(fd, &stbuf) != 0) {
    close(fd);
    napi_throw_error(env, nullptr, "Failed to stat file");
    return nullptr;
  }

  size_t fs = static_cast<size_t>(stbuf.st_size);
  void *map = nullptr;

  if (fs > 0) {
    map = mmap(nullptr, fs, PROT_READ, MAP_PRIVATE, fd, 0);
    if (map == MAP_FAILED) {
      close(fd);
      napi_throw_error(env, nullptr, "Failed to map file");
      return nullptr;
    }

#if defined(MADV_WILLNEED)
    (void)madvise(map, fs, MADV_WILLNEED);
#endif
#if defined(MADV_SEQUENTIAL) && defined(MADV_RANDOM)
    (void)madvise(map, fs, backward ? MADV_RANDOM : MADV_SEQUENTIAL);
#elif defined(MADV_SEQUENTIAL)
    (void)madvise(map, fs, MADV_SEQUENTIAL);
#endif
#if defined(MADV_HUGEPAGE)
    (void)madvise(map, fs, MADV_HUGEPAGE);
#endif
  }

  close(fd);

  PagerState *ps = new PagerState();
  ps->filesize = fs;
  ps->data = static_cast<const char *>(map);
  ps->page_lines = static_cast<size_t>(page_lines);
  ps->delimiter = delim;
  ps->backward = backward;

  ps->scanner_thread = std::jthread(background_scanner, ps);

  napi_value external;
  napi_create_external(env, ps, pager_external_finalize, nullptr, &external);
  return external;
}

static napi_value NextSync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }

  PagerState *ps = nullptr;
  if (napi_get_value_external(env, argv[0], reinterpret_cast<void **>(&ps)) !=
          napi_ok ||
      !ps) {
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }

  PageItem item;

  while (!queue_pop_item(ps, item)) {
    if (ps->aborted.load(std::memory_order_acquire) ||
        ps->scan_finished.load(std::memory_order_acquire)) {
      napi_value n;
      napi_get_null(env, &n);
      return n;
    }

    std::unique_lock lk(ps->mtx);
    ps->cv.wait(lk, [&] {
      return ps->aborted.load(std::memory_order_acquire) ||
             ps->scan_finished.load(std::memory_order_acquire) ||
             !queue_empty(ps);
    });
  }

  napi_value buf;
  if (!create_page_value(env, ps, item, &buf)) {
    if (item.owned && item.data)
      free(const_cast<char *>(item.data));
    napi_throw_error(env, nullptr, "Failed to create buffer");
    return nullptr;
  }

  return buf;
}

struct AsyncWaitData {
  PagerState *ps;
  napi_deferred deferred;
  PageItem result;
  bool found = false;
  napi_async_work work = nullptr;
};

static napi_value reject_with_error(napi_env env, napi_deferred deferred,
                                    const char *msg) {
  napi_value s, e;
  napi_create_string_utf8(env, msg, NAPI_AUTO_LENGTH, &s);
  napi_create_error(env, nullptr, s, &e);
  napi_reject_deferred(env, deferred, e);
  napi_value n;
  napi_get_null(env, &n);
  return n;
}

static napi_value Next(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], promise;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_value n;
    napi_get_null(env, &n);
    return n;
  }

  PagerState *ps = nullptr;
  if (napi_get_value_external(env, argv[0], reinterpret_cast<void **>(&ps)) !=
          napi_ok ||
      !ps) {
    napi_deferred deferred;
    napi_create_promise(env, &deferred, &promise);
    return reject_with_error(env, deferred, "Invalid pager handle");
  }

  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);

  PageItem item;
  if (queue_pop_item(ps, item)) {
    napi_value buf;
    if (!create_page_value(env, ps, item, &buf)) {
      if (item.owned && item.data)
        free(const_cast<char *>(item.data));
      return reject_with_error(env, deferred, "Failed to create buffer");
    }

    napi_resolve_deferred(env, deferred, buf);
    return promise;
  }

  if (ps->aborted.load(std::memory_order_acquire) ||
      ps->scan_finished.load(std::memory_order_acquire)) {
    napi_value n;
    napi_get_null(env, &n);
    napi_resolve_deferred(env, deferred, n);
    return promise;
  }

  auto *data =
      new AsyncWaitData{ps, deferred, {nullptr, 0, false}, false, nullptr};
  ps->retain_ref();

  napi_value name;
  napi_create_string_utf8(env, "WaitPage", NAPI_AUTO_LENGTH, &name);

  napi_status s = napi_create_async_work(
      env, nullptr, name,
      [](napi_env, void *d) {
        auto *wd = static_cast<AsyncWaitData *>(d);

        while (!wd->ps->aborted.load(std::memory_order_acquire)) {
          if (queue_pop_item(wd->ps, wd->result)) {
            wd->found = true;
            return;
          }

          if (wd->ps->scan_finished.load(std::memory_order_acquire))
            return;

          std::unique_lock lk(wd->ps->mtx);
          wd->ps->cv.wait(lk, [&] {
            return wd->ps->aborted.load(std::memory_order_acquire) ||
                   wd->ps->scan_finished.load(std::memory_order_acquire) ||
                   !queue_empty(wd->ps);
          });
        }
      },
      [](napi_env env, napi_status, void *d) {
        auto *wd = static_cast<AsyncWaitData *>(d);

        napi_value res;
        if (wd->found) {
          if (!create_page_value(env, wd->ps, wd->result, &res)) {
            if (wd->result.owned && wd->result.data)
              free(const_cast<char *>(wd->result.data));
            reject_with_error(env, wd->deferred, "Failed to create buffer");
          } else {
            napi_resolve_deferred(env, wd->deferred, res);
          }
        } else {
          napi_get_null(env, &res);
          napi_resolve_deferred(env, wd->deferred, res);
        }

        napi_delete_async_work(env, wd->work);
        wd->ps->release_ref();
        delete wd;
      },
      data, &data->work);

  if (s != napi_ok) {
    ps->release_ref();
    delete data;
    return reject_with_error(env, deferred, "Failed to create async work");
  }

  if (napi_queue_async_work(env, data->work) != napi_ok) {
    napi_delete_async_work(env, data->work);
    ps->release_ref();
    delete data;
    return reject_with_error(env, deferred, "Failed to queue async work");
  }

  return promise;
}

static napi_value Close(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc >= 1) {
    PagerState *ps = nullptr;
    if (napi_get_value_external(env, argv[0], reinterpret_cast<void **>(&ps)) ==
            napi_ok &&
        ps) {
      ps->request_close();
    }
  }

  napi_value promise, resolved;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  napi_get_undefined(env, &resolved);
  napi_resolve_deferred(env, deferred, resolved);
  return promise;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"open", nullptr, Open, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"nextSync", nullptr, NextSync, nullptr, nullptr, nullptr, napi_default,
       nullptr},
      {"next", nullptr, Next, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"close", nullptr, Close, nullptr, nullptr, nullptr, napi_default,
       nullptr}};

  napi_define_properties(env, exports, 4, desc);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)