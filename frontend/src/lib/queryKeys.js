/** TanStack Query keys, in one place so socket handlers patch the same entries as screens. */
export const queryKeys = Object.freeze({
  me: ['me'],
  categories: ['categories'],
  addresses: ['addresses'],
  bookingsAll: ['bookings'],
  myBookings: (status) => ['bookings', 'my', status],
  assignedBookings: (status) => ['bookings', 'technician', status],
  booking: (id) => ['booking', id],
  messages: (id) => ['messages', id],
  notifications: ['notifications'],
  technicianPublic: (userId) => ['technician', userId, 'public'],
  // Technician area (Phase 4)
  technicianMe: ['technician', 'me'],
  nearbyRequests: ['technician', 'nearby'],
  earnings: ['technician', 'earnings'],
  // Admin area (Phase 4)
  adminStats: ['admin', 'stats'],
  adminUsers: (params) => ['admin', 'users', params],
  adminTechnicians: (params) => ['admin', 'technicians', params],
  adminBookings: (params) => ['admin', 'bookings', params],
  adminBooking: (id) => ['admin', 'booking', id],
  adminCategories: ['admin', 'categories'],
});
