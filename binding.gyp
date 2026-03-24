{
  "targets": [
    {
      "target_name": "pager",
      "sources": [ "src/native/pager.native.cc" ],
      "cflags_cc": [
        "-O3",
        "-std=c++23",
        "-fno-exceptions",
        "-Wall",
        "-fPIC"
      ],
      "xcode_settings": {
        "CLANG_CXX_LANGUAGE_STANDARD": "c++23",
        "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
        "OTHER_CPLUSPLUSFLAGS": [ "-O3", "-fno-exceptions" ]
      },
      "conditions": [
        ['OS=="linux"', {
          "libraries": [ "-lrt" ]
        }]
      ]
    }
  ]
}