// githubFetch 缓存策略测试：sha 类覆盖写入依赖"读取时最新"，必须禁用浏览器 HTTP 缓存
import { describe, it, expect, vi, afterEach } from 'vitest';
import { githubFetch } from '../src/lib/githubApi.js';

const config = { owner: 'owner', repo: 'repo', token: 'token' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('githubFetch', () => {
  it('请求携带 cache=no-store，避免读取到浏览器缓存的过期 sha', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sha: 'abc' })
    }));
    vi.stubGlobal('fetch', fetchMock);

    await githubFetch(config, 'https://api.github.com/repos/owner/repo/contents/x.png');

    const [, init] = fetchMock.mock.calls[0];
    expect(init.cache).toBe('no-store');
  });
});
