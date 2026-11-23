import * as notificationService from '../services/notification.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await notificationService.listNotifications(req.user.id, req.query);
  sendSuccess(res, { notifications: items }, { meta });
});

export const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.user.id, req.params.id);
  sendSuccess(res, { notification });
});

export const markAllRead = asyncHandler(async (req, res) => {
  sendSuccess(res, await notificationService.markAllRead(req.user.id));
});
