import * as bookingService from '../services/booking.service.js';
import * as messageService from '../services/message.service.js';
import { toPublicPath } from '../middleware/upload.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const create = asyncHandler(async (req, res) => {
  const images = (req.files ?? []).map(toPublicPath);
  const result = await bookingService.createBooking(req.user, req.body, images);
  sendSuccess(res, result, { status: 201 });
});

export const listMine = asyncHandler(async (req, res) => {
  const { items, meta } = await bookingService.listCustomerBookings(req.user, req.query);
  sendSuccess(res, { bookings: items }, { meta });
});

export const listAssigned = asyncHandler(async (req, res) => {
  const { items, meta } = await bookingService.listTechnicianBookings(req.user, req.query);
  sendSuccess(res, { bookings: items }, { meta });
});

export const getOne = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingDetail(req.params.id, req.user);
  sendSuccess(res, { booking });
});

export const acceptAndSchedule = asyncHandler(async (req, res) => {
  const booking = await bookingService.acceptAndSchedule(req.params.id, req.user, req.body);
  sendSuccess(res, { booking });
});

export const proposeSchedule = asyncHandler(async (req, res) => {
  const booking = await bookingService.proposeSchedule(req.params.id, req.user, req.body);
  sendSuccess(res, { booking });
});

export const respondSchedule = asyncHandler(async (req, res) => {
  const result = await bookingService.respondSchedule(req.params.id, req.user, req.body);
  sendSuccess(res, result);
});

export const release = asyncHandler(async (req, res) => {
  const result = await bookingService.releaseBooking(req.params.id, req.user, req.body);
  sendSuccess(res, result);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const booking = await bookingService.updateStatus(req.params.id, req.user, req.body);
  sendSuccess(res, { booking });
});

export const cancel = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(req.params.id, req.user, req.body);
  sendSuccess(res, { booking });
});

export const rebroadcast = asyncHandler(async (req, res) => {
  const result = await bookingService.rebroadcastBooking(req.params.id, req.user);
  sendSuccess(res, result);
});

export const review = asyncHandler(async (req, res) => {
  const booking = await bookingService.reviewBooking(req.params.id, req.user, req.body);
  sendSuccess(res, { booking }, { status: 201 });
});

export const listMessages = asyncHandler(async (req, res) => {
  const { items, meta } = await messageService.listMessages(req.params.id, req.user, req.query);
  sendSuccess(res, { messages: items }, { meta });
});

export const postMessage = asyncHandler(async (req, res) => {
  const message = await messageService.postMessage(req.params.id, req.user, req.body);
  sendSuccess(res, { message }, { status: 201 });
});
