import { data, http, withMeta } from './client.js';

/** @param {FormData} formData multipart body with fields and up to 5 `images` */
export const createBooking = (formData) => data(http.post('/bookings', formData));

export const listMyBookings = (params) => withMeta(http.get('/bookings/my', { params }));
export const listAssignedBookings = (params) =>
  withMeta(http.get('/bookings/technician/my', { params }));

export const getBooking = (id) => data(http.get(`/bookings/${id}`)).then((d) => d.booking);

export const acceptAndSchedule = (id, body) =>
  data(http.post(`/bookings/${id}/accept-and-schedule`, body));
export const proposeSchedule = (id, body) =>
  data(http.post(`/bookings/${id}/propose-schedule`, body));
export const respondSchedule = (id, body) =>
  data(http.post(`/bookings/${id}/respond-schedule`, body));
export const releaseBooking = (id, body) => data(http.post(`/bookings/${id}/release`, body));
export const updateStatus = (id, body) => data(http.patch(`/bookings/${id}/status`, body));
export const cancelBooking = (id, body) => data(http.post(`/bookings/${id}/cancel`, body));
export const rebroadcast = (id) => data(http.post(`/bookings/${id}/rebroadcast`));
export const reviewBooking = (id, body) => data(http.post(`/bookings/${id}/review`, body));

export const listMessages = (id, params = { limit: 100 }) =>
  withMeta(http.get(`/bookings/${id}/messages`, { params }));
export const sendMessage = (id, text) =>
  data(http.post(`/bookings/${id}/messages`, { text })).then((d) => d.message);
