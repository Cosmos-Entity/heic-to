import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8')
  .replace('import buildLibheif from LIB_HEIF_PATH;', 'const buildLibheif = factory;');

for (const asynchronous of [false, true]) {
  test(`worker awaits readiness and initializes once (async=${asynchronous})`, async () => {
    let initialized = 0;
    let decoded = 0;
    let released = 0;
    const replies = [];
    let resolveFactory;
    const readiness = new Promise(resolve => { resolveFactory = resolve; });
    const library = {
      HeifDecoder: class {
        constructor() { this.decoder = {}; }
        decode() {
          decoded++;
          return [{ get_width: () => 1, get_height: () => 1,
            display: (data, callback) => callback(data), free: () => { released++; } }];
        }
      },
      heif_context_free() {},
    };
    const context = {
      factory: () => { initialized++; return asynchronous ? readiness : library; },
      ImageData: class { constructor() { this.data = new Uint8ClampedArray(4); } },
      postMessage: message => replies.push(message),
    };
    runInNewContext(workerSource, context);
    const first = context.onmessage({ data: { id: 'first', buffer: new ArrayBuffer(0) } });
    const second = context.onmessage({ data: { id: 'second', buffer: new ArrayBuffer(0) } });
    await Promise.resolve();
    assert.equal(initialized, 1);
    if (asynchronous) assert.equal(decoded, 0);
    resolveFactory(library);
    await Promise.all([first, second]);
    assert.equal(decoded, 2);
    assert.equal(released, 2);
    assert.deepEqual(replies.map(x => [x.id, x.error]), [['first', ''], ['second', '']]);
  });
}

test('worker returns initialization failure to each caller', async () => {
  const replies = [];
  const context = {
    factory: () => Promise.reject(new Error('decoder initialization failed')),
    postMessage: message => replies.push(message),
  };
  runInNewContext(workerSource, context);
  await context.onmessage({ data: { id: 'failure', buffer: new ArrayBuffer(0) } });
  assert.equal(replies[0].id, 'failure');
  assert.match(replies[0].error, /decoder initialization failed/);
  assert.equal(replies[0].imageData, null);
});
