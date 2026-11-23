import * as authService from '../services/auth.service.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../services/token.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

const requestMeta = (req) => ({ userAgent: req.get('user-agent') ?? '' });

export const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.registerUser(
    req.body,
    requestMeta(req),
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { user, accessToken }, { status: 201 });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.loginUser(
    req.body,
    requestMeta(req),
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { user, accessToken });
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await authService.refreshSession(
      readRefreshCookie(req),
      requestMeta(req),
    );
    setRefreshCookie(res, refreshToken);
    sendSuccess(res, { user, accessToken });
  } catch (err) {
    // A rejected refresh token is useless to the browser; drop it. Keep it on server errors.
    if (err?.status === 401) clearRefreshCookie(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(readRefreshCookie(req));
  clearRefreshCookie(res);
  sendSuccess(res, { loggedOut: true });
});

export const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, await authService.getMe(req.user.id));
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateMe(req.user.id, req.body);
  sendSuccess(res, { user });
});

export const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await authService.listAddresses(req.user.id);
  sendSuccess(res, { addresses });
});

export const addAddress = asyncHandler(async (req, res) => {
  const result = await authService.addAddress(req.user.id, req.body);
  sendSuccess(res, result, { status: 201 });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const result = await authService.updateAddress(req.user.id, req.params.addressId, req.body);
  sendSuccess(res, result);
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const result = await authService.deleteAddress(req.user.id, req.params.addressId);
  sendSuccess(res, result);
});
