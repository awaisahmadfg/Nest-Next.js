'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { useAppStore } from '@/store/appStore';
import { notificationService } from '@/services/notificationService';

export enum NotificationType {
  ROLE_APPROVED = 'ROLE_APPROVED',
  ROLE_REJECTED = 'ROLE_REJECTED',
}

export interface NotificationData {
  id?: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  status: 'UNREAD' | 'READ';
  actionBy?: number | null;
  actionByUserProfileImageUrl?: string | null;
  actionByUserFullName?: string | null;
  relatedEntityId?: number | null;
  relatedEntityType?: string | null;
  reason?: string | null;
  createdAt: string;
  readAt?: string;
}

export function useWebSocketNotifications() {
  const { accessToken } = useAuth();
  const { addNotification } = useAppStore();
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isReconnectingRef = useRef(false);
  const wasConnectedRef = useRef(false);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const getApiUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';

    let apiUrl =
      process.env.NEXT_PUBLIC_API_URL || window.location.origin.replace(':3000', ':4000');

    // IMPORTANT: strip /api for WebSocket base
    if (apiUrl.endsWith('/api')) {
      apiUrl = apiUrl.slice(0, -4);
    }

    // Ensure URL doesn't end with a slash
    apiUrl = apiUrl.replace(/\/$/, '');

    return apiUrl;
  }, []);

  const connect = useCallback(() => {
    if (!accessToken || socketRef.current?.connected) return;

    const apiUrl = getApiUrl();
    if (!apiUrl) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socketUrl = `${apiUrl}/notifications`;

    const socket = io(socketUrl, {
      auth: { token: accessToken },
      query: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      isReconnectingRef.current = false;
      wasConnectedRef.current = true;
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      // Only log unexpected disconnections, not normal ones
      if (reason === 'io server disconnect' || reason === 'io client disconnect') {
        return;
      }
    });

    socket.on('connect_error', (error) => {
      reconnectAttemptsRef.current += 1;
      isReconnectingRef.current = true;
      setIsConnected(false);

      // Only log errors after multiple failed attempts or for non-retryable errors
      if (reconnectAttemptsRef.current > 3) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[WS] Connection error (attempts:',
            reconnectAttemptsRef.current,
            '):',
            error.message
          );
        }
      }
    });

    socket.on('error', (error) => {
      // Only log non-reconnection errors
      if (!isReconnectingRef.current && process.env.NODE_ENV === 'development') {
        console.error('[WS] Socket error:', error);
      }
    });

    socket.on('notification', (data: NotificationData) => {
      const notificationWithId: NotificationData = {
        ...data,
        id: data.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      setNotifications((prev) => {
        if (prev.some((n) => n.id === notificationWithId.id)) return prev;
        return [notificationWithId, ...prev].slice(0, 50);
      });

      setUnreadCount((prev) => prev + 1);

      addNotification({
        type: data.type === NotificationType.ROLE_REJECTED ? 'error' : 'success',
        title: data.title,
        message: data.message,
      });
    });

    socketRef.current = socket;
  }, [accessToken, getApiUrl, addNotification]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const fetchNotifications = useCallback(
    async (params?: { status?: 'UNREAD' | 'READ'; page?: number; limit?: number }) => {
      try {
        setIsLoading(true);
        const response = await notificationService.getNotifications({
          limit: 50,
          ...params,
        });

        const formattedNotifications: NotificationData[] = response.notifications.map((n) => ({
          id: n.id,
          userId: n.userId,
          type: n.type as NotificationType,
          title: n.title,
          message: n.message,
          status: n.status,
          actionBy: n.actionBy ?? undefined,
          actionByUserProfileImageUrl: n.actionByUserProfileImageUrl ?? undefined,
          actionByUserFullName: n.actionByUserFullName ?? undefined,
          relatedEntityId: n.relatedEntityId ?? undefined,
          relatedEntityType: n.relatedEntityType ?? undefined,
          reason: n.reason ?? undefined,
          createdAt: n.createdAt,
          readAt: n.readAt || undefined,
        }));

        setNotifications(formattedNotifications);
        setUnreadCount(response.unreadCount);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Notifications] Failed to fetch notifications:', error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await notificationService.getUnreadCount();
      setUnreadCount(response.unreadCount);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Notifications] Failed to fetch unread count:', error);
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      if (unreadCount === 0) {
        return;
      }

      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          status: 'READ' as const,
          readAt: n.readAt || new Date().toISOString(),
        }))
      );

      setUnreadCount(0);

      await notificationService.markAllAsRead();
      await fetchUnreadCount();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Notifications] Failed to mark all as read:', error);
      }
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [unreadCount, fetchNotifications, fetchUnreadCount]);

  // Fetch notifications on mount and when accessToken is available
  useEffect(() => {
    if (accessToken) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [accessToken, fetchNotifications, fetchUnreadCount]);

  // Connect WebSocket when accessToken is available
  useEffect(() => {
    if (accessToken) {
      connect();
    }
    return disconnect;
  }, [accessToken, connect, disconnect]);

  // Determine if we're actually reconnecting (was connected before, now disconnected)
  const isReconnecting = !isConnected && wasConnectedRef.current;

  return {
    notifications,
    isConnected,
    isReconnecting,
    unreadCount,
    isLoading,
    markAllAsRead,
    fetchNotifications,
  };
}
