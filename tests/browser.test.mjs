import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const root = resolve('.');
let browser, server, origin;
before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const strict = url.pathname === '/csp-test';
    if (url.pathname === '/' || strict) {
      if (strict) res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src blob:; connect-src 'self'; img-src blob:");
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Decoder test</title>');
      return;
    }
    const path = resolve(root, '.' + url.pathname);
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    try {
      res.setHeader('Content-Type', extname(path) === '.js' ? 'text/javascript' : 'application/octet-stream');
      res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

for (const variant of ['normal', 'csp']) {
  test(`${variant}: actual native decoder is 1.23.4`, async () => {
    const page = await browser.newPage();
    try {
      await page.goto(origin + (variant === 'csp' ? '/csp-test' : '/'));
      const number = await page.evaluate(async variant => {
        const name = variant === 'csp' ? 'libheif-without-unsafe-eval' : 'libheif';
        const { default: factory } = await import(`/src/lib/${name}.js`);
        const decoder = factory();
        if (decoder instanceof Promise) throw new Error('Expected synchronous asm.js factory');
        return decoder.heif_get_version_number();
      }, variant);
      assert.equal(number, (1 << 24) | (23 << 16) | (4 << 8));
    } finally { await page.close(); }
  });
}

for (const entry of ['heic-to.js', 'csp/heic-to.js', 'next/heic-to.js']) {
  test(`${entry}: valid conversion and recovery after malformed input`, async () => {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    try {
      await page.goto(origin + (entry.startsWith('csp/') ? '/csp-test' : '/'));
      const result = await page.evaluate(async entry => {
        const { heicTo, isHeic } = await import(`/dist/${entry}`);
        const bytes = await (await fetch('/.build/libheif/examples/example.heic')).arrayBuffer();
        const image = new Blob([bytes], { type: 'image/heic' });
        const bounded = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('decoder timeout')), 10000))]);
        if (!await isHeic(image)) throw new Error('HEIC detection failed');
        if (await isHeic(new Blob(['not an image']))) throw new Error('Invalid image accepted');
        for (const invalid of [new Blob([]), new Blob(['not an image']), new Blob([bytes.slice(0, 64)])]) {
          let rejected = false;
          try { await bounded(heicTo({ blob: invalid, type: 'image/png' })); }
          catch (error) {
            if (String(error).includes('timeout')) throw error;
            rejected = true;
          }
          if (!rejected) throw new Error('Malformed image accepted');
        }
        const outputs = [];
        for (const type of ['image/png', 'image/jpeg', 'bitmap']) {
          const converted = await bounded(heicTo({ blob: image, type, quality: 0.8 }));
          const bitmap = type === 'bitmap' ? converted : await createImageBitmap(converted);
          outputs.push({ type: type === 'bitmap' ? type : converted.type, width: bitmap.width, height: bitmap.height });
          bitmap.close();
        }
        return outputs;
      }, entry);
      assert.deepEqual(result.map(x => x.type), ['image/png', 'image/jpeg', 'bitmap']);
      for (const output of result) { assert.ok(output.width > 0); assert.ok(output.height > 0); }
    } finally { await page.close(); }
  });
}
