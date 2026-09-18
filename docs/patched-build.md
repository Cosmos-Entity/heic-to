# Cosmos patched decoder build (ENG-14549)

The upstream 1.5.2 distribution bundles libheif 1.22.2. This fork publishes
`@cosmos-entity/heic-to@1.5.2-cosmos.1` rebuilt with libheif 1.23.4. Consumers can
use an npm alias without changing imports:

```
"heic-to": "npm:@cosmos-entity/heic-to@1.5.2-cosmos.1"
```

CI pins libheif to commit 4e14f5942c1732ace9611b9522cc991501445463, libde265
1.0.16 to its SHA256-verified release archive, and emsdk 4.0.15 to commit
389a68bc35dcff7ebae4614e1615099dafda00d1 (which pins compiler downloads).
`build-decoder.sh` builds the normal and CSP decoders with `USE_WASM=0`,
`USE_ES6=0` (with an explicit ESM default export), and respectively `USE_UNSAFE_EVAL=1/0`. Optional uncompressed,
WebCodecs, AOM and OpenJPEG decoders stay disabled. It then bundles all upstream
entry points. The published package retains LGPL notices and the corresponding
libheif/libde265 source archives, version manifest and reproduction script in
`provenance/`; the JS API source remains in `src/`.

The GitHub build job has no Nexus credentials. It produces an `npm-heic-to`
artifact only after Chromium tests verify native version numbers, valid HEIC
conversion to JPEG/PNG/bitmap, rejection of truncated/invalid files followed by
successful reuse, and the CSP variant without unsafe-eval. Tests are bounded
by per-case and process timeouts and use only isolated CI resources. They are
compatibility checks, not proof against every historical security exploit.
CI also runs the upstream overlay-amplification and identity-image-size security
regression executables, each in a separate process with a 30-second timeout.
The worker awaits Emscripten initialization for both synchronous and Promise
factories, preserving the public asynchronous conversion API.
The trusted cosmos-actions vendor publisher verifies the source run/head and
publishes its exact tarball to Nexus's npm-hosted repository. Consumers read
through npm-group. Never republish an existing version with different bytes.

For local reproduction use Node 24, install the pinned emsdk release, source
`emsdk_env.sh`, then run `scripts/build-decoder.sh`, `npm ci`, `npm run build`,
`npx playwright install chromium`, and `npm test`. Native compilation belongs to
CI by default. Do not publish the checked-in upstream `dist` or decoder files;
only the successful CI artifact contains the rebuilt decoder. Upstream source
files remain checked in to keep the fork reviewable.

Retire the fork and alias once an upstream release includes the required fixes
and passes the same consumer compatibility checks.
