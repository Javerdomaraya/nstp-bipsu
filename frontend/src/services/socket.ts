import { io, Socket } from 'socket.io-client';
import { API_BASE } from './apiConfig';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    let socketUrl = '/';
    if (API_BASE && API_BASE.startsWith('http')) {
      try {
        const url = new URL(API_BASE);
        socketUrl = url.origin;
      } catch {
        socketUrl = '/';
      }
    }
    socket = io(socketUrl, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}
