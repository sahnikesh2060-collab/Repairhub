import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request context (currently the request id) available to any code the request runs. */
export const requestContext = new AsyncLocalStorage();

export const currentRequestId = () => requestContext.getStore()?.requestId ?? null;
