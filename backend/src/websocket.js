import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from './db/prisma.js';
import { env } from './config/env.js';
import { getAllowedOrigins } from './config/cors.js';
import { COORDINATOR_SCOPE_TYPES } from './modules/staff/staff.service.js';

let io = null;

function readSessionToken(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('nstp_auth='))
    ?.slice('nstp_auth='.length) || null;
}

function isAllowedSocketOrigin(origin) {
  return typeof origin === 'string' && getAllowedOrigins().includes(origin);
}

export async function resolveAuthorizedRooms(user) {
  const rooms = [`user:${user.id}`];

  if (user.role === 'ADMIN') rooms.push('role:admin');
  if (user.role === 'STUDENT') {
    const student = await prisma.studentProfile.findUnique({
      where: { userId: user.id }, select: { sectionId: true, componentId: true },
    });
    if (student?.sectionId) rooms.push(`class:${student.sectionId}`);
    if (student?.componentId) rooms.push(`component:${student.componentId}`);
  }
  if (user.role === 'INSTRUCTOR') {
    const instructor = await prisma.instructorProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (instructor) {
      const sections = await prisma.section.findMany({ where: { instructorId: instructor.id }, select: { id: true, componentId: true } });
      for (const section of sections) {
        rooms.push(`class:${section.id}`);
        if (section.componentId) rooms.push(`component:${section.componentId}`);
      }
    }
  }
  if (user.role === 'COORDINATOR') {
    const coordinator = await prisma.coordinatorProfile.findUnique({ where: { userId: user.id }, select: { componentId: true, scope: true } });
    // Same imported scope map as the HTTP authorization middleware. This used to
    // repeat the mapping inline with a final `: ['CWTS', 'CWTS_COAST_GUARD']`
    // branch, which subscribed a coordinator with an unrecognised scope to the
    // CWTS component rooms. An unknown scope now joins no component room at all.
    const types = COORDINATOR_SCOPE_TYPES[coordinator?.scope];
    if (types) {
      const components = await prisma.nSTPComponent.findMany({ where: { type: { in: types } }, select: { id: true } });
      components.forEach((component) => rooms.push(`component:${component.id}`));
    }
  }

  return rooms;
}

export async function authenticateSocketHandshake(socket, next) {
  try {
    if (!isAllowedSocketOrigin(socket.handshake.headers.origin)) return next(new Error('Unauthorized socket connection.'));
    const token = readSessionToken(socket.handshake.headers.cookie);
    if (!token) return next(new Error('Unauthorized socket connection.'));
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    const account = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, role: true, status: true } });
    if (!account || (account.status && account.status !== 'ACTIVE') || (account.role && account.role !== decoded.role)) return next(new Error('Unauthorized socket connection.'));
    socket.user = { id: account.id, email: account.email || decoded.email, role: account.role || decoded.role };
    socket.authorizedRooms = await resolveAuthorizedRooms(socket.user);
    return next();
  } catch {
    return next(new Error('Unauthorized socket connection.'));
  }
}

export function setupWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedSocketOrigin(origin)) return callback(null, true);
        return callback(new Error('CORS blocked origin'));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowRequest(request, callback) {
      callback(null, isAllowedSocketOrigin(request.headers.origin));
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use(authenticateSocketHandshake);

  io.on('connection', (socket) => {
    socket.join(socket.authorizedRooms);
    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO() {
  return io;
}

export function emitCollectionChange(collection, action = 'updated') {
  emitToRoom(io, 'role:admin', 'data-changed', { collection, action, timestamp: new Date().toISOString() });
}

export function emitUserEvent(userId, event, payload) {
  if (!userId) return;
  emitToRoom(io, `user:${userId}`, event, payload);
}

export function emitToRoom(socketServer, room, event, payload) {
  if (!socketServer) return;
  socketServer.to(room).emit(event, payload);
}

export function broadcastAnnouncement(event, payload) {
  if (!io) return;
  io.sockets.emit(event, payload);
}
