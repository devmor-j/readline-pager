#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <fcntl.h>
#include <immintrin.h>
#include <mutex>
#include <node_api.h>
#include <stop_token>
#include <sys/mman.h>
#include <sys/stat.h>
#include <thread>
#include <unistd.h>

#if defined(__aarch64__) || defined(__arm__)
#include <arm_neon.h>
#include <asm/hwcap.h>
#include <sys/auxv.h>
#endif

enum class CpuFeature { Scalar, AVX2, Neon };

static CpuFeature detect_cpu() {
#if defined(__x86_64__) || defined(__i386__)
  if (__builtin_cpu_supports("avx2"))
    return CpuFeature::AVX2;
#elif defined(__aarch64__)
  return CpuFeature::Neon;
#elif defined(__arm__)
  if (getauxval(AT_HWCAP) & HWCAP_NEON)
    return CpuFeature::Neon;
#endif
  return CpuFeature::Scalar;
}

struct PageBoundary {
  size_t start;
  size_t length;
};

static constexpr size_t QUEUE_CAP = 8192;

struct PagerState {
  int fd = -1;
  size_t filesize = 0;
  const char *data = nullptr;
  uint32_t page_lines = 1000;
  unsigned char delimiter = '\n';

  PageBoundary queue[QUEUE_CAP];
  std::atomic<size_t> head{0};
  std::atomic<size_t> tail{0};

  std::mutex mtx;
  std::condition_variable cv;

  std::atomic<bool> scan_finished{false};
  std::atomic<bool> aborted{false};

  std::jthread scanner_thread;

  PagerState() = default;
  ~PagerState() {
    aborted = true;
    cv.notify_all();
    if (scanner_thread.joinable())
      scanner_thread.join();
    if (data && filesize > 0)
      munmap(const_cast<char *>(data), filesize);
    if (fd >= 0)
      close(fd);
  }
};

static void buffer_finalize(napi_env env, void *data, void *hint) {
  (void)env;
  (void)data;
  (void)hint;
}

static inline bool queue_push(PagerState *st, size_t start, size_t len) {
  while (!st->aborted.load(std::memory_order_relaxed)) {
    size_t head = st->head.load(std::memory_order_acquire);
    size_t next = (head + 1) & (QUEUE_CAP - 1);
    if (next != st->tail.load(std::memory_order_acquire)) {
      st->queue[head] = {start, len};
      st->head.store(next, std::memory_order_release);
      st->cv.notify_one();
      return true;
    }
    std::unique_lock lk(st->mtx);
    st->cv.wait(lk);
  }
  return false;
}

static inline bool queue_pop(PagerState *st, PageBoundary &out) {
  size_t tail = st->tail.load(std::memory_order_acquire);
  if (tail == st->head.load(std::memory_order_acquire))
    return false;
  out = st->queue[tail];
  st->tail.store((tail + 1) & (QUEUE_CAP - 1), std::memory_order_release);
  st->cv.notify_one();
  return true;
}

static void scan_avx2(std::stop_token stop, PagerState *st) {
  size_t i = 0;
  const size_t size = st->filesize;
  const char *data = st->data;
  const __m256i needle = _mm256_set1_epi8(static_cast<char>(st->delimiter));

  size_t page_start = 0;
  uint32_t lines = 0;

  while (i + 32 <= size && !stop.stop_requested()) {
    __m256i chunk =
        _mm256_loadu_si256(reinterpret_cast<const __m256i *>(data + i));
    uint32_t mask = static_cast<uint32_t>(
        _mm256_movemask_epi8(_mm256_cmpeq_epi8(chunk, needle)));

    while (mask) {
      int offset = __builtin_ctz(mask);
      size_t pos = i + offset;

      if (++lines >= st->page_lines) {
        if (!queue_push(st, page_start, pos - page_start))
          return;
        page_start = pos + 1;
        lines = 0;
      }

      mask &= mask - 1;
    }

    i += 32;
  }

  for (; i < size && !stop.stop_requested(); ++i) {
    if (data[i] == st->delimiter) {
      if (++lines >= st->page_lines) {
        if (!queue_push(st, page_start, i - page_start))
          return;
        page_start = i + 1;
        lines = 0;
      }
    }
  }

  if (page_start < size)
    queue_push(st, page_start, size - page_start);
}

static void scan_neon(std::stop_token stop, PagerState *st) {
#if defined(__aarch64__) || defined(__arm__)
  size_t i = 0;
  const size_t size = st->filesize;
  const char *data = st->data;
  const uint8x16_t needle = vdupq_n_u8(st->delimiter);

  size_t page_start = 0;
  uint32_t lines = 0;

  while (i + 16 <= size && !stop.stop_requested()) {
    uint8x16_t chunk = vld1q_u8(reinterpret_cast<const uint8_t *>(data + i));
    uint8x16_t cmp = vceqq_u8(chunk, needle);

    uint64x2_t res = vreinterpretq_u64_u8(cmp);

    if (vgetq_lane_u64(res, 0) || vgetq_lane_u64(res, 1)) {
      for (int b = 0; b < 16; ++b) {
        if (data[i + b] == st->delimiter) {
          if (++lines >= st->page_lines) {
            if (!queue_push(st, page_start, i + b - page_start))
              return;
            page_start = i + b + 1;
            lines = 0;
          }
        }
      }
    }

    i += 16;
  }

  for (; i < size && !stop.stop_requested(); ++i) {
    if (data[i] == st->delimiter) {
      if (++lines >= st->page_lines) {
        if (!queue_push(st, page_start, i - page_start))
          return;
        page_start = i + 1;
        lines = 0;
      }
    }
  }

  if (page_start < size)
    queue_push(st, page_start, size - page_start);
#endif
}

static void background_scanner(std::stop_token stop, PagerState *st) {
  CpuFeature feature = detect_cpu();

  if (feature == CpuFeature::AVX2)
    scan_avx2(stop, st);
  else if (feature == CpuFeature::Neon)
    scan_neon(stop, st);
  else
    scan_avx2(stop, st);

  st->scan_finished = true;
  st->cv.notify_all();
}

static napi_value Open(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3], external;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  char path[4096];
  size_t path_len;
  napi_get_value_string_utf8(env, argv[0], path, sizeof(path), &path_len);

  uint32_t pl = 1000;
  if (argc >= 2)
    napi_get_value_uint32(env, argv[1], &pl);

  unsigned char delim = '\n';
  if (argc >= 3) {
    char dstr[4];
    size_t dlen;
    napi_get_value_string_utf8(env, argv[2], dstr, 4, &dlen);
    if (dlen > 0)
      delim = dstr[0];
  }

  int fd = open(path, O_RDONLY);
  if (fd < 0)
    return nullptr;

  struct stat stbuf;
  fstat(fd, &stbuf);

  size_t fs = stbuf.st_size;

  void *map = mmap(nullptr, fs, PROT_READ, MAP_PRIVATE, fd, 0);
  madvise(map, fs, MADV_SEQUENTIAL | MADV_WILLNEED);

  PagerState *ps = new PagerState();

  ps->fd = fd;
  ps->filesize = fs;
  ps->data = (const char *)map;
  ps->page_lines = pl;
  ps->delimiter = delim;

  ps->scanner_thread = std::jthread(background_scanner, ps);

  napi_create_external(
      env, ps, [](napi_env e, void *d, void *h) { delete (PagerState *)d; },
      nullptr, &external);

  return external;
}

static napi_value NextSync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  PagerState *ps;
  napi_get_value_external(env, argv[0], (void **)&ps);

  PageBoundary b;

  while (!queue_pop(ps, b)) {
    if (ps->scan_finished) {
      napi_value n;
      napi_get_null(env, &n);
      return n;
    }
    std::unique_lock lk(ps->mtx);
    ps->cv.wait(lk);
  }

  napi_value buf;

  napi_create_external_buffer(env, b.length, (void *)(ps->data + b.start),
                              buffer_finalize, ps, &buf);

  return buf;
}

struct AsyncWaitData {
  PagerState *ps;
  napi_deferred deferred;
  PageBoundary result;
  bool found = false;
};

static napi_value Next(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], promise;
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  PagerState *ps;
  napi_get_value_external(env, argv[0], (void **)&ps);

  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);

  PageBoundary b;

  if (queue_pop(ps, b)) {
    napi_value buf;

    napi_create_external_buffer(env, b.length, (void *)(ps->data + b.start),
                                buffer_finalize, ps, &buf);

    napi_resolve_deferred(env, deferred, buf);
  } else if (ps->scan_finished) {
    napi_value n;
    napi_get_null(env, &n);
    napi_resolve_deferred(env, deferred, n);
  } else {
    AsyncWaitData *data = new AsyncWaitData{ps, deferred, {0, 0}, false};

    napi_value name;
    napi_create_string_utf8(env, "WaitPage", NAPI_AUTO_LENGTH, &name);

    napi_async_work work;

    napi_create_async_work(
        env, nullptr, name,

        [](napi_env e, void *d) {
          AsyncWaitData *wd = (AsyncWaitData *)d;

          while (!wd->ps->aborted) {
            if (queue_pop(wd->ps, wd->result)) {
              wd->found = true;
              return;
            }
            if (wd->ps->scan_finished)
              return;

            std::unique_lock lk(wd->ps->mtx);
            wd->ps->cv.wait(lk);
          }
        },

        [](napi_env e, napi_status s, void *d) {
          AsyncWaitData *wd = (AsyncWaitData *)d;

          napi_value res;

          if (wd->found) {
            napi_create_external_buffer(
                e, wd->result.length, (void *)(wd->ps->data + wd->result.start),
                buffer_finalize, wd->ps, &res);
          } else {
            napi_get_null(e, &res);
          }

          napi_resolve_deferred(e, wd->deferred, res);

          delete wd;
        },

        data, &work);

    napi_queue_async_work(env, work);
  }

  return promise;
}

static napi_value Close(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  PagerState *ps;
  napi_get_value_external(env, argv[0], (void **)&ps);

  if (ps) {
    ps->aborted = true;
    ps->cv.notify_all();
  }

  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
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