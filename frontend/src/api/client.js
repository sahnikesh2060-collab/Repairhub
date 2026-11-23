import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '/api';

// ---- In-memory access token store (never localStorage / sessionStorage) ----
let accessToken = null;
const tokenListeners = new Set();

export const tokenStore = Object.freeze({
  get: () => accessToken,
  set(token) {
    accessToken = token || null;
    for (const listener of tokenListeners) listener(accessToken);
  },
  subscribe(listener) {
    tokenListeners.add(listener);
    return () => tokenListeners.delete(listener);
  },
});

// AuthContext registers what to do when the session cannot be refreshed.
let authFailureHandler = () => {};
export function setAuthFailureHandler(handler) {
  authFailureHandler = handler;
}

/** Normalises any axios error into an Error with { code, message, details, status }. */
export function toApiError(error) {
  if (error?.isApiError) return error;
  const status = error?.response?.status ?? 0;
  const body = error?.response?.data;
  let message = body?.error?.message;
  if (!message) {
    message = error?.response
      ? `Request failed (${status})`
      : 'Cannot reach the server. Check your connection.';
  }
  const apiError = new Error(message);
  apiError.isApiError = true;
  apiError.status = status;
  apiError.code = body?.error?.code ?? (error?.response ? `HTTP_${status}` : 'NETWORK_ERROR');
  apiError.details = body?.error?.details;
  return apiError;
}

export const http = axios.create({ baseURL: API_URL, withCredentials: true });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// One refresh at a time: concurrent 401s wait for the same promise, then retry.
let refreshPromise = null;

/** Rotates the refresh cookie and stores the new access token. Resolves { accessToken, user }. */
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        tokenStore.set(res.data.data.accessToken);
        return res.data.data;
      })
      .catch((error) => {
        tokenStore.set(null);
        throw toApiError(error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const NO_RETRY = /\/auth\/(login|refresh|register|logout)$/;

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const retryable =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !NO_RETRY.test(original.url ?? '');
    if (retryable) {
      original._retried = true;
      try {
        await refreshSession();
        return http(original);
      } catch (refreshError) {
        authFailureHandler();
        return Promise.reject(toApiError(refreshError));
      }
    }
    return Promise.reject(toApiError(error));
  },
);

/** Unwraps { success, data } -> data. */
export const data = (promise) => promise.then((res) => res.data.data);

/** Unwraps { success, data, meta } -> { ...data, meta }. */
export const withMeta = (promise) =>
  promise.then((res) => ({ ...res.data.data, meta: res.data.meta ?? {} }));

/** Maps backend validation details onto react-hook-form fields. Returns true if any matched. */
export function applyFieldErrors(error, setError, fields) {
  let matched = false;
  for (const d of error?.details ?? []) {
    if (d?.field && fields.includes(d.field)) {
      setError(d.field, { type: 'server', message: d.message });
      matched = true;
    }
  }
  return matched;
}
