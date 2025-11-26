'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { useAppStore } from '@/store/appStore';
import { notificationService } from '@/services/notificationService';

export enum NotificationType {
  ROLE_APPROVED = 'ROLE_APPROVED',
  ROLE_REJECTED = 'ROLE_REJECTED',
  ROLE_PENDING = 'ROLE_PENDING',
  PROPERTY_INVITED = 'PROPERTY_INVITED',
  PROPERTY_APPROVED = 'PROPERTY_APPROVED',
  PROPERTY_REJECTED = 'PROPERTY_REJECTED',
  INVITATION_RECEIVED = 'INVITATION_RECEIVED',
  INVITATION_ACCEPTED = 'INVITATION_ACCEPTED',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
}

export interface NotificationData {
  id?: string;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  actionBy?: number | null;
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

    console.log('[WS] Using API URL for notifications:', apiUrl);
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
    console.log('[WS] Attempting to connect to:', socketUrl);

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
    });

    socket.on('connect', () => {
      console.log('[WS] Connected to /notifications', { apiUrl, socketId: socket.id });
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected from /notifications', { reason });
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[WS] Connection error for /notifications', {
        message: error.message,
        error: error,
        apiUrl: `${apiUrl}/notifications`,
      });
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('[WS] Socket error:', error);
    });

    socket.on('notification', (data: NotificationData) => {
      console.log('[WS] Received notification', data);

      const notificationWithId: NotificationData = {
        ...data,
        id: data.id || `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      };

      // Add to notifications list if not already present
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notificationWithId.id)) return prev;
        return [notificationWithId, ...prev].slice(0, 50);
      });

      // Update unread count
      setUnreadCount((prev) => prev + 1);

      // Show toast notification
      addNotification({
        type:
          data.type === NotificationType.ROLE_APPROVED
            ? 'success'
            : data.type === NotificationType.ROLE_REJECTED
              ? 'error'
              : 'info',
        title: data.title,
        message: data.message,
      });
    });

    socket.on('notification_read', (data: { notificationId: string }) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === data.notificationId
            ? { ...n, status: 'READ' as const, readAt: new Date().toISOString() }
            : n
        )
      );
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
    async (params?: { status?: 'UNREAD' | 'READ' | 'ARCHIVED'; page?: number; limit?: number }) => {
      try {
        setIsLoading(true);
        const response = await notificationService.getNotifications({
          limit: 50,
          ...params,
        });

        // Convert API response to NotificationData format
        const formattedNotifications: NotificationData[] = response.notifications.map((n) => ({
          id: n.id,
          userId: n.userId,
          type: n.type as NotificationType,
          title: n.title,
          message: n.message,
          status: n.status,
          actionBy: n.actionBy ?? undefined,
          relatedEntityId: n.relatedEntityId ?? undefined,
          relatedEntityType: n.relatedEntityType ?? undefined,
          reason: n.reason ?? undefined,
          createdAt: n.createdAt,
          readAt: n.readAt || undefined,
        }));

        setNotifications(formattedNotifications);
        setUnreadCount(response.unreadCount);
      } catch (error) {
        console.error('[Notifications] Failed to fetch notifications:', error);
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
      console.error('[Notifications] Failed to fetch unread count:', error);
    }
  }, []);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        // Optimistically update UI
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, status: 'READ' as const, readAt: new Date().toISOString() }
              : n
          )
        );

        // Update unread count
        setUnreadCount((prev) => Math.max(0, prev - 1));

        // Call API
        await notificationService.markAsRead(notificationId);

        // Also emit via WebSocket if connected
        if (socketRef.current?.connected) {
          socketRef.current.emit('mark_as_read', { notificationId });
        }
      } catch (error) {
        console.error('[Notifications] Failed to mark as read:', error);
        // Revert optimistic update on error
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

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

  return {
    notifications,
    isConnected,
    unreadCount,
    isLoading,
    markAsRead,
    clearNotifications,
    fetchNotifications,
    fetchUnreadCount,
    connect,
    disconnect,
  };
}
