{
  "targets": [
    {
      "target_name": "readline-pager",
      "sources": [ "src/native/pager.native.cc" ],
      "cflags_cc": [
        "-O3",
        "-std=c++23",
        "-fno-exceptions",
        "-fno-rtti",
        "-Wall",
        "-Wextra",
        "-fPIC",
        "-flto",
        "-fno-strict-aliasing",
        "-fomit-frame-pointer"
      ],
      "ldflags": [
        "-flto",
        "-Wl,-O3",
        "-Wl,--as-needed",
        "-Wl,--strip-all"
      ],
      "conditions": [
        ['target_arch=="x64"', {
          "cflags_cc": [
            "-mavx2",
            "-mbmi",
            "-mbmi2",
            "-mlzcnt"
          ]
        }],
        ['target_arch=="arm64"', {
          "cflags_cc": [
            "-march=armv8-a+simd"
          ]
        }],
        ['OS=="linux"', {
          "libraries": [ "-lrt" ]
        }]
      ]
    }
  ]
}