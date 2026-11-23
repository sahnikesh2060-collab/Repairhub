import * as adminService from '../services/admin.service.js';
import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const stats = asyncHandler(async (_req, res) => {
  sendSuccess(res, await adminService.stats());
});

export const listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listUsers(req.query);
  sendSuccess(res, { users: items }, { meta });
});

export const setUserActive = asyncHandler(async (req, res) => {
  const user = await adminService.setUserActive(req.user.id, req.params.id, req.body);
  sendSuccess(res, { user });
});

export const listTechnicians = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listTechnicians(req.query);
  sendSuccess(res, { technicians: items }, { meta });
});

export const verifyTechnician = asyncHandler(async (req, res) => {
  const profile = await adminService.verifyTechnician(req.params.userId, req.body);
  sendSuccess(res, { profile });
});

export const listBookings = asyncHandler(async (req, res) => {
  const { items, meta } = await adminService.listBookings(req.query);
  sendSuccess(res, { bookings: items }, { meta });
});

export const getBooking = asyncHandler(async (req, res) => {
  const booking = await adminService.getBooking(req.params.id, req.user);
  sendSuccess(res, { booking });
});

export const listCategories = asyncHandler(async (_req, res) => {
  sendSuccess(res, { categories: await categoryService.listAllCategories() });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  sendSuccess(res, { category }, { status: 201 });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  sendSuccess(res, { category });
});
