// imageApi 缓存失效测试：保存白板缩略图覆盖后，blob 缓存必须失效以重新拉取新内容
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBlobUrlForRaw, invalidateBlobUrl, rawUrlToPath } from '../src/lib/imageApi';

const config = { owner: 'owner', repo: 'repo', token: 'token' };

beforeEach(() => {
  let seq = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob([String(seq++)])
  })));
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => `blob:mock-${seq}`),
    revokeObjectURL: vi.fn()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('invalidateBlobUrl', () => {
  it('使缓存失效后，再次请求会重新拉取（不命中旧 blob）', async () => {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/main/images/a.png`;
    const first = await getBlobUrlForRaw(config, rawUrl);
    const second = await getBlobUrlForRaw(config, rawUrl); // 命中缓存
    expect(second).toBe(first);

    invalidateBlobUrl(rawUrl); // 模拟保存覆盖后的缓存失效

    const third = await getBlobUrlForRaw(config, rawUrl); // 应重新拉取
    expect(third).not.toBe(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first); // 旧 blob 被释放
    expect(fetch).toHaveBeenCalledTimes(2); // 首次 + 失效后各一次
  });

  it('失效不存在的 URL 不抛错且不影响其他缓存', async () => {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/main/images/b.png`;
    const first = await getBlobUrlForRaw(config, rawUrl);
    invalidateBlobUrl('https://example.com/unknown.png');
    const again = await getBlobUrlForRaw(config, rawUrl); // 仍命中缓存
    expect(again).toBe(first);
  });

  it('rawUrlToPath 提取仓库内路径（去掉 branch 段）', () => {
    const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/main/images/c.png`;
    expect(rawUrlToPath(config, rawUrl)).toBe('images/c.png');
    expect(rawUrlToPath(config, 'https://other.com/x.png')).toBeNull();
  });
});