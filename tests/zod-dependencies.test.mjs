import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const vercelRequire = createRequire(require.resolve('vercel/package.json'));
const config = vercelRequire('@vercel/cli-config');
const python = vercelRequire('@vercel/python-analysis');

test('Vercel configuration validates and preserves unknown settings', () => {
  assert.deepEqual(config.parseGlobalConfig({ usedBefore: true, custom: 'preserved' }), {
    usedBefore: true, custom: 'preserved',
  });
  assert.throws(() => config.parseGlobalConfig({ usedBefore: 42 }));
  assert.throws(() => config.parseGlobalConfig({ credStorage: 'not-a-store' }));
});

test('Vercel Python manifest schemas accept valid records and reject invalid values', () => {
  assert.equal(python.PipfileLikeSchema.safeParse({ packages: { requests: '*' } }).success, true);
  assert.equal(python.PipfileLikeSchema.safeParse({ packages: { requests: 42 } }).success, false);
  assert.equal(python.PipfileLockLikeSchema.safeParse({ default: { requests: { version: '==2.32.5' } } }).success, true);
  assert.equal(python.PipfileLockLikeSchema.safeParse({ default: { requests: { version: 42 } } }).success, false);
  assert.equal(python.PyProjectTomlSchema.safeParse({ project: { name: 'example', version: '1.0', dependencies: ['requests'] } }).success, true);
  assert.equal(python.PyProjectTomlSchema.safeParse({ project: { name: 42 } }).success, false);
});

test('each overridden Vercel dependency resolves bounded collection validation', () => {
  for (const name of ['@vercel/backends', '@vercel/express', '@vercel/hono', '@vercel/python-analysis', '@vercel/cli-config', '@vercel/cli-auth/oauth']) {
    const dependencyRequire = createRequire(vercelRequire.resolve(name));
    const { z } = dependencyRequire('zod');
    let visits = 0;
    const schema = z.array(z.string().refine(() => { visits++; return true; })).max(1);
    assert.equal(schema.safeParse(Array(100).fill('item')).success, false, name);
    assert.equal(visits, 0, name);
  }
});
