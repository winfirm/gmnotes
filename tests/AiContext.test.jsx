// @vitest-environment jsdom
// AI 配置中的 apiKey：作为 Bearer Token 附加到请求，并持久化到 localStorage
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../src/contexts/ToastContext.jsx', () => ({
  useToast: () => toast
}));
vi.mock('../src/contexts/I18nContext.jsx', () => ({
  useI18n: () => ({ t: (k) => k, locale: 'en' })
}));

import { AiProvider, useAi } from '../src/contexts/AiContext.jsx';

function Probe() {
  const { aiConfig, setAiField, generateAiContent, testAiConnection, saveAiConfig } = useAi();
  return (
    <div>
      <input
        data-testid="apiKey"
        value={aiConfig.apiKey || ''}
        onChange={(e) => setAiField('apiKey', e.target.value)}
      />
      <button data-testid="generate" onClick={() => generateAiContent('hello', 'title')}>gen</button>
      <button data-testid="test" onClick={() => testAiConnection()}>test</button>
      <button data-testid="save" onClick={() => saveAiConfig()}>save</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AiProvider>
      <Probe />
    </AiProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  toast.showToast.mockReset();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'result' } }] })
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('apiKey 鉴权', () => {
  it('配置 apiKey 后生成请求携带 Authorization: Bearer', async () => {
    renderProbe();
    fireEvent.change(screen.getByTestId('apiKey'), { target: { value: 'sk-123' } });
    fireEvent.click(screen.getByTestId('generate'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer sk-123');
  });

  it('未配置 apiKey 时不携带 Authorization 头', async () => {
    renderProbe();
    fireEvent.click(screen.getByTestId('generate'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it('配置 apiKey 后测试连接请求携带 Authorization: Bearer', async () => {
    renderProbe();
    fireEvent.change(screen.getByTestId('apiKey'), { target: { value: 'sk-abc' } });
    fireEvent.click(screen.getByTestId('test'));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/models');
    expect(options.headers.Authorization).toBe('Bearer sk-abc');
  });

  it('保存后 apiKey 持久化到 localStorage', async () => {
    renderProbe();
    fireEvent.change(screen.getByTestId('apiKey'), { target: { value: 'sk-persist' } });
    fireEvent.click(screen.getByTestId('save'));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('gmnotes_ai_config'));
      expect(saved.apiKey).toBe('sk-persist');
    });
  });
});
