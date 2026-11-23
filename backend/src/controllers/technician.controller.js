import * as technicianService from '../services/technician.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, await technicianService.getMyTechnicianAccount(req.user.id));
});

export const updateProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, await technicianService.updateMyProfile(req.user.id, req.body));
});

export const setAvailability = asyncHandler(async (req, res) => {
  sendSuccess(res, await technicianService.setAvailability(req.user.id, req.body));
});

export const updateLocation = asyncHandler(async (req, res) => {
  sendSuccess(res, await technicianService.updateLocation(req.user.id, req.body));
});

export const nearbyRequests = asyncHandler(async (req, res) => {
  const { items, meta } = await technicianService.nearbyRequests(req.user.id);
  sendSuccess(res, { requests: items }, { meta });
});

export const earnings = asyncHandler(async (req, res) => {
  sendSuccess(res, await technicianService.earnings(req.user.id, req.query));
});

export const publicProfile = asyncHandler(async (req, res) => {
  const technician = await technicianService.publicProfile(req.params.userId);
  sendSuccess(res, { technician });
});
