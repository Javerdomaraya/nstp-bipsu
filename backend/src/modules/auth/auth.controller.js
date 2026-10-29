import { sendSuccess, sendCreated, sendError } from '../../utils/apiResponse.js';
import { approvePendingRegistration, registerUser, loginUser, getUserById, rejectPendingRegistration, submitPendingRegistration, updateUserProfile } from './auth.service.js';

const SESSION_COOKIE = 'nstp_auth';
const cookieSameSite = process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === 'production' ? 'none' : 'lax');
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
const sessionCookieOptions = {
  httpOnly: true,
  // Cross-origin Vercel -> Render requests require SameSite=None and Secure.
  secure: process.env.NODE_ENV === 'production' || cookieSameSite === 'none',
  sameSite: cookieSameSite,
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

export async function getAuthStatus(req, res) {
  return sendSuccess(res, {
    configured: true,
    message: 'Auth module is ready.',
  });
}

export async function handleRegister(req, res) {
  try {
    const result = await registerUser(req.body);
    return sendCreated(res, result);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
}

export async function handleLogin(req, res) {
  try {
    const identifier = req.body.identifier || req.body.email || req.body.username;
    const { password } = req.body;
    const { token, user } = await loginUser(identifier, password);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions);
    return sendSuccess(res, { user });
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
}

export async function handlePendingRegistration(req, res) {
  try {
    return sendCreated(res, await submitPendingRegistration(req.body));
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
}

export function handleLogout(req, res) {
  const { maxAge, ...clearCookieOptions } = sessionCookieOptions;
  res.clearCookie(SESSION_COOKIE, clearCookieOptions);
  return res.status(204).end();
}

export async function handleApproveRegistration(req, res) {
  try { return sendSuccess(res, await approvePendingRegistration(req.params.id, req.user.id)); }
  catch (err) { return sendError(res, err.message, err.statusCode || 500); }
}

export async function handleRejectRegistration(req, res) {
  try { await rejectPendingRegistration(req.params.id, req.user.id, req.body?.reason); return res.status(204).end(); }
  catch (err) { return sendError(res, err.message, err.statusCode || 500); }
}

export async function handleGetProfile(req, res) {
  try {
    const profile = await getUserById(req.user.id);
    return sendSuccess(res, profile);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
}

export async function handleUpdateProfile(req, res) {
  try {
    const { password, ...safeFields } = req.body;
    const profile = await updateUserProfile(req.user.id, req.body);
    return sendSuccess(res, profile);
  } catch (err) {
    return sendError(res, err.message, err.statusCode || 500);
  }
}
