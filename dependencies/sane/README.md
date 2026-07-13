# Custom SANE dependency

Place the custom Raspberry Pi SANE build artifacts here.

Keep these files from the same SANE build. Do not mix a patched `genesys` backend with a
different `scanimage` version unless you have explicitly tested that combination.

Expected layout:

```text
dependencies/sane/
  VERSION
  bin/
    scanimage
  lib/aarch64-linux-gnu/sane/
    libsane-genesys.so.1.1.1
```

`tools/setup` can then install the custom SANE build from this folder.

The setup script installs:

```text
dependencies/sane/bin/scanimage
  -> /usr/local/bin/scanimage

dependencies/sane/lib/aarch64-linux-gnu/sane/libsane-genesys.so.1.1.1
  -> /usr/lib/aarch64-linux-gnu/sane/libsane-genesys.so.1.1.1
```

It also recreates this symlink:

```text
/usr/lib/aarch64-linux-gnu/sane/libsane-genesys.so.1
  -> libsane-genesys.so.1.1.1
```

`libsane.so`, `dll.conf`, and `genesys.conf` are not part of the custom dependency package unless
they are intentionally modified later.
