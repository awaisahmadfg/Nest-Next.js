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
  Avatar,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useWebSocketNotifications, NotificationData } from '@/hooks/useWebSocketNotifications';

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
  const {
    notifications,
    unreadCount,
    markAllAsRead,
    isReconnecting,
    isLoading,
    fetchNotifications,
  } = useWebSocketNotifications();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(event.currentTarget);
      fetchNotifications();
      markAllAsRead();
    },
    [fetchNotifications, markAllAsRead]
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

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

          {isReconnecting && (
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
                  isUnread
                />
              ))}
              {readNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id || `read-${notification.createdAt}`}
                  notification={notification}
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
  isUnread: boolean;
}

function NotificationItem({ notification, isUnread }: NotificationItemProps) {
  const formatDate = formatTimeAgo;

  return (
    <ListItemButton
      sx={{
        backgroundColor: isUnread ? '#111827' : '#020617', // unread vs read
        borderBottom: '1px solid #1f2937',
        py: 1.5,
        px: 2,
        alignItems: 'flex-start',
        gap: 1.5,
        '&:hover': {
          backgroundColor: isUnread ? '#1f2937' : '#111827',
        },
      }}
    >
      {/* Avatar with unread indicator */}
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        {isUnread && (
          <Box
            sx={{
              position: 'absolute',
              top: -2,
              left: -2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#2970FF',
              border: '2px solid #020617',
              zIndex: 1,
            }}
          />
        )}
        <Avatar
          src={notification.actionByUserProfileImageUrl || undefined}
          alt="User"
          sx={{
            width: 40,
            height: 40,
            bgcolor: '#374151',
            fontSize: '0.875rem',
          }}
        >
          {notification.actionByUserProfileImageUrl
            ? null
            : (notification.actionByUserFullName || notification.title || 'U')
                .charAt(0)
                .toUpperCase()}
        </Avatar>
      </Box>

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
                color: 'white',
                display: 'block',
                mb: 0.5,
              }}
            >
              {notification.message}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: '#B0B0B0',
                fontSize: '0.75rem',
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
