#!/usr/bin/env bash
set -euo pipefail
# emsdk 4.0.15 is installed from its pinned manifest by CI.
root=$(cd "$(dirname "$0")/.." && pwd)
source_dir="$root/.build/libheif"
mkdir -p "$root/.build" "$root/provenance"
cd "$root/.build"
curl --fail --location --retry 3 https://codeload.github.com/strukturag/libheif/tar.gz/4e14f5942c1732ace9611b9522cc991501445463 -o libheif.tar.gz
curl --fail --location --retry 3 https://github.com/strukturag/libde265/releases/download/v1.0.16/libde265-1.0.16.tar.gz -o libde265-1.0.16.tar.gz
printf '%s\n' \
  '09c28e7bd9e03f599e226e289caa44aee8d67168e6c62a1a5103cf4d9c5a7e50  libheif.tar.gz' \
  'b92beb6b53c346db9a8fae968d686ab706240099cdd5aff87777362d668b0de7  libde265-1.0.16.tar.gz' | sha256sum --check
mkdir -p "$source_dir"
tar xf libheif.tar.gz -C "$source_dir" --strip-components=1
# Distribute corresponding sources and license notices alongside the binary.
cp libheif.tar.gz libde265-1.0.16.tar.gz "$root/provenance/"
cp "$source_dir/COPYING" "$root/provenance/libheif-COPYING"
tar xOf libde265-1.0.16.tar.gz libde265-1.0.16/COPYING > "$root/provenance/libde265-COPYING"
cp "$root/scripts/build-decoder.sh" "$root/provenance/build-decoder.sh"
for variant in normal csp; do
  mkdir -p "$root/.build/$variant"
  cd "$root/.build/$variant"
  cp ../libde265-1.0.16.tar.gz .
  unsafe_eval=1
  output=libheif.js
  if [[ "$variant" == csp ]]; then
    unsafe_eval=0
    output=libheif-without-unsafe-eval.js
  fi
  LIBDE265_VERSION=1.0.16 USE_WASM=0 USE_ES6=0 USE_TYPESCRIPT=0 \
    USE_UNSAFE_EVAL="$unsafe_eval" ENABLE_UNCOMPRESSED=0 ENABLE_AOM=0 \
    ENABLE_OPENJPEG=0 ENABLE_WEBCODECS=0 CORES=2 \
    "$source_dir/build-emscripten.sh" "$source_dir"
  # Emscripten's ES6 mode adds a Node import shim that browser bundlers cannot
  # resolve; only the export wrapper needs to be ESM. Await readiness in worker.
  cp libheif.js "$root/src/lib/$output"
  printf '\nexport default libheif;\n' >> "$root/src/lib/$output"
done
cat > "$root/provenance/versions.json" <<'JSON'
{
  "libheif": "1.23.4",
  "libheifCommit": "4e14f5942c1732ace9611b9522cc991501445463",
  "libde265": "1.0.16",
  "emscripten": "4.0.15",
  "emsdkCommit": "389a68bc35dcff7ebae4614e1615099dafda00d1",
  "upstreamHeicToCommit": "f37af866f9aa6212ddc84b67a279c9f2386aba4f",
  "wasm": false,
  "uncompressedCodec": false
}
JSON
