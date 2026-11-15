// The API client (src/services/api.jsx): while the free server wakes up, reads wait and try
// again, but nothing that changes data is ever sent twice. Errors keep the server's code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, isWaking, setAccessToken } from '../src/services/api.jsx';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// what Netlify's proxy answers while Render is asleep: not our JSON envelope
const sleeping = () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });

let fetchMock;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('waits and reads again while the server wakes up, and says so meanwhile', async () => {
    fetchMock.mockResolvedValueOnce(sleeping()).mockResolvedValueOnce(sleeping()).mockResolvedValueOnce(json(200, [{ id: 'guntur' }]));
    const result = apiFetch('/cities');
    await vi.advanceTimersByTimeAsync(0);
    expect(isWaking()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual([{ id: 'guntur' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(isWaking()).toBe(false);
  });

  it('never repeats a request that changes data', async () => {
    fetchMock.mockResolvedValue(sleeping());
    const result = apiFetch('/orders', { method: 'POST', body: { addressId: 1 } }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(60_000);
    const err = await result;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not wait on a real server error with our JSON envelope', async () => {
    fetchMock.mockResolvedValue(json(503, { error: { code: 'NOT_READY', message: 'Try again soon' } }));
    const err = await apiFetch('/cities').catch((e) => e);
    expect(err).toMatchObject({ status: 503, code: 'NOT_READY', message: 'Try again soon' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the token, the client header and the idempotency key', async () => {
    setAccessToken('token-123');
    fetchMock.mockResolvedValue(json(201, { ok: true }));
    await apiFetch('/orders', { method: 'POST', body: { a: 1 }, idempotencyKey: 'key-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/orders$/);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token-123', 'X-SnackHub-Client': 'web', 'Idempotency-Key': 'key-1', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('refreshes once after an expired token and sends the read again', async () => {
    setAccessToken('old');
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new' }))
      .mockResolvedValueOnce(json(200, { name: 'Asha' }));
    await expect(apiFetch('/me')).resolves.toEqual({ name: 'Asha' });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
  });

  it('turns a dropped connection into a clear offline error', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/cities')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
