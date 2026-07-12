# Custom SANE dependency

Place the custom Raspberry Pi SANE build artifacts here.

Keep these files from the same SANE build. Do not mix a patched `genesys` backend with a
different `scanimage` / `libsane` version unless you have explicitly tested that combination.

Expected layout:

```text
dependencies/sane/
  VERSION
  bin/
    scanimage
  lib/
    libsane.so
    libsane.so.1
    libsane.so.1.2.1
    sane/
      libsane-genesys.so
      libsane-genesys.so.1
      libsane-genesys.so.1.2.1
  etc/
    sane.d/
      dll.conf
      genesys.conf
```

`tools/initial-setup` can then install the custom SANE build from this folder into `/usr/local`.
