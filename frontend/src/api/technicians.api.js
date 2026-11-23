import { data, http, withMeta } from './client.js';

export const getMyTechnicianAccount = () => data(http.get('/technicians/me'));
export const updateProfile = (body) => data(http.put('/technicians/me/profile', body));
export const setAvailability = (isAvailable) =>
  data(http.patch('/technicians/me/availability', { isAvailable }));
export const updateLocation = (body) => data(http.patch('/technicians/me/location', body));
export const nearbyRequests = () => withMeta(http.get('/technicians/nearby-requests'));
export const earnings = (tzOffsetMinutes = 0) =>
  data(http.get('/technicians/me/earnings', { params: { tzOffsetMinutes } }));
export const publicProfile = (userId) =>
  data(http.get(`/technicians/${userId}/public`)).then((d) => d.technician);
