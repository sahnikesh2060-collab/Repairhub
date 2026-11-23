const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres between two { lng, lat } points. */
export function distanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** { lng, lat } from a GeoJSON Point ([lng, lat]); null when missing. */
export function fromPoint(point) {
  const c = point?.coordinates;
  return Array.isArray(c) && c.length === 2 ? { lng: c[0], lat: c[1] } : null;
}

/** Google Maps directions link to a point. */
export function directionsUrl({ lat, lng }) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Minutes east of UTC for the browser, as the earnings endpoint expects (Nepal = 345). */
export function browserTzOffsetMinutes() {
  return -new Date().getTimezoneOffset();
}
