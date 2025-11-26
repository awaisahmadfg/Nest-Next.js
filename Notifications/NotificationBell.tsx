'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Badge,
  IconButton,
  Popover,
  Typography,
  List,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useWebSocketNotifications, NotificationData } from '@/hooks/useWebSocketNotifications';

// Simple time-ago formatter similar to the design
const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Just now';
  }
};

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, isConnected, isLoading, fetchNotifications } =
    useWebSocketNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
      // Fetch fresh notifications from database when bell is clicked
      fetchNotifications();
    },
    [fetchNotifications]
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleNotificationClick = useCallback(
    (notification: NotificationData) => {
      if (notification.id && notification.status === 'UNREAD') {
        markAsRead(notification.id);
      }
    },
    [markAsRead]
  );

  const open = Boolean(anchorEl);
  const id = open ? 'notification-popover' : undefined;

  const unreadNotifications = notifications.filter((n) => n.status === 'UNREAD');
  const readNotifications = notifications.filter((n) => n.status === 'READ');

  return (
    <>
      <IconButton
        onClick={handleClick}
        sx={{
          color: 'white',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          },
        }}
        aria-describedby={id}
        aria-label="Notifications"
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: 420,
            maxHeight: 620,
            backgroundColor: '#020617',
            border: '1px solid #111827',
            borderRadius: '16px',
            mt: 1,
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 2,
            }}
          >
            <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>
              Notifications
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 500 }}
              onClick={() => {
                // TODO: navigate to full notifications page
              }}
            >
              view all
            </Typography>
          </Box>

          {!isConnected && (
            <Typography variant="caption" sx={{ color: '#f97316', mb: 1, display: 'block' }}>
              Reconnecting to notifications…
            </Typography>
          )}

          {isLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                Loading notifications...
              </Typography>
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                No notifications
              </Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: 520, overflow: 'auto', p: 0 }}>
              {unreadNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id || `unread-${notification.createdAt}`}
                  notification={notification}
                  onClick={handleNotificationClick}
                  isUnread
                />
              ))}
              {readNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id || `read-${notification.createdAt}`}
                  notification={notification}
                  onClick={handleNotificationClick}
                  isUnread={false}
                />
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}

interface NotificationItemProps {
  notification: NotificationData;
  onClick: (notification: NotificationData) => void;
  isUnread: boolean;
}

function NotificationItem({ notification, onClick, isUnread }: NotificationItemProps) {
  const formatDate = formatTimeAgo;

  return (
    <ListItemButton
      onClick={() => onClick(notification)}
      sx={{
        backgroundColor: isUnread ? '#111827' : '#020617', // unread vs read
        borderBottom: '1px solid #1f2937',
        py: 1.5,
        px: 2,
        alignItems: 'flex-start',
        '&:hover': {
          backgroundColor: isUnread ? '#1f2937' : '#111827',
        },
      }}
    >
      <ListItemText
        primary={
          <Typography
            variant="body2"
            sx={{
              color: '#f9fafb',
              fontWeight: isUnread ? 600 : 500,
              mb: 0.5,
            }}
          >
            {notification.title}
          </Typography>
        }
        secondary={
          <>
            <Typography
              variant="caption"
              sx={{
                color: isUnread ? '#e5e7eb' : '#9ca3af',
                display: 'block',
                mb: 0.5,
              }}
            >
              {notification.message}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: '#6b7280',
                fontSize: '0.7rem',
              }}
            >
              {formatDate(notification.createdAt)}
            </Typography>
          </>
        }
      />
    </ListItemButton>
  );
}
