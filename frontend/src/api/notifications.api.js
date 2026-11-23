import { data, http, withMeta } from './client.js';

export const listNotifications = (params = { limit: 10 }) =>
  withMeta(http.get('/notifications', { params }));
export const markRead = (id) => data(http.patch(`/notifications/${id}/read`));
export const markAllRead = () => data(http.patch('/notifications/read-all'));
