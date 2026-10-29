import { io, Socket } from 'socket.io-client';
import { API_BASE } from './apiConfig';

let socket: Socket | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getSocketUrl(): string {
  const apiBase = API_BASE;
  if (apiBase === '/api') return window.location.origin;
  return apiBase.replace(/\/api\/?$/, '');
}

export function connectSocket(): Socket {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  if (socket?.connected) return socket;
  if (socket) return socket;

  socket = io(getSocketUrl(), {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {});

  socket.on('data-changed', (data: { collection: string; action: string; timestamp: string }) => {
    window.dispatchEvent(new CustomEvent('nstp-socket-sync', { detail: data.collection }));
  });

  socket.on('disconnect', () => {});

  return socket;
}

export function disconnectSocket(immediate = false): void {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
  const doDisconnect = () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  };
  if (immediate) {
    doDisconnect();
  } else {
    disconnectTimer = setTimeout(doDisconnect, 200);
  }
}

export function getSocket(): Socket | null {
  return socket;
}
