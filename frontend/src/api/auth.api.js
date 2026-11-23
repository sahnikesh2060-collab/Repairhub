import { data, http, refreshSession, tokenStore } from './client.js';

export async function login(credentials) {
  const result = await data(http.post('/auth/login', credentials));
  tokenStore.set(result.accessToken);
  return result;
}

export async function register(body) {
  const result = await data(http.post('/auth/register', body));
  tokenStore.set(result.accessToken);
  return result;
}

export const refresh = () => refreshSession();

export async function logout() {
  try {
    await http.post('/auth/logout');
  } finally {
    tokenStore.set(null);
  }
}

/** { user, technicianProfile? } */
export const me = () => data(http.get('/auth/me'));
export const updateMe = (body) => data(http.patch('/auth/me', body));

export const listAddresses = () => data(http.get('/auth/me/addresses'));
export const addAddress = (body) => data(http.post('/auth/me/addresses', body));
export const updateAddress = (id, body) => data(http.patch(`/auth/me/addresses/${id}`, body));
export const deleteAddress = (id) => data(http.delete(`/auth/me/addresses/${id}`));
