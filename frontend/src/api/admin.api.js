import { data, http, withMeta } from './client.js';

export const stats = () => data(http.get('/admin/stats'));
export const listUsers = (params) => withMeta(http.get('/admin/users', { params }));
export const setUserActive = (id, isActive) =>
  data(http.patch(`/admin/users/${id}/active`, { isActive }));
export const listTechnicians = (params) => withMeta(http.get('/admin/technicians', { params }));
export const verifyTechnician = (userId, isVerified) =>
  data(http.patch(`/admin/technicians/${userId}/verify`, { isVerified }));
export const listBookings = (params) => withMeta(http.get('/admin/bookings', { params }));
export const getBooking = (id) => data(http.get(`/admin/bookings/${id}`)).then((d) => d.booking);
export const listCategories = () => data(http.get('/admin/categories')).then((d) => d.categories);
export const createCategory = (body) => data(http.post('/admin/categories', body));
export const updateCategory = (id, body) => data(http.patch(`/admin/categories/${id}`, body));
