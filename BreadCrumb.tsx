'use client';

import React from 'react';
import { Breadcrumbs as MuiBreadcrumbs, Link, Typography } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';
import { usePathname, useRouter } from 'next/navigation';
import { useBreadcrumbStore } from '@/app/store/breadcrumbStore';

export default function Breadcrumbs() {
  const pathname = usePathname();
  const router = useRouter();
  const { breadcrumbs: customBreadcrumbs, setBreadcrumbs } = useBreadcrumbStore();

  const pathSegments = (pathname ?? '').split('/').filter(Boolean);

  const defaultBreadcrumbs = pathSegments.map((segment, index) => {
    const path = '/' + pathSegments.slice(0, index + 1).join('/');
    const label = segment
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const isLast = index === pathSegments.length - 1;

    return {
      label,
      path,
      isLast,
    };
  });

  // Use custom breadcrumbs if available, otherwise use default
  const breadcrumbsToUse = customBreadcrumbs.length > 0 ? customBreadcrumbs : defaultBreadcrumbs;

  const handleBreadcrumbClick = (path: string) => {
    setBreadcrumbs([]);
    router.push(path);
  };

  return (
    <MuiBreadcrumbs
      separator={<NavigateNext fontSize="small" sx={{ color: '#4A4A4A' }} />}
      sx={{ m: 2 }}
    >
      <Link
        component="button"
        variant="body2"
        onClick={() => handleBreadcrumbClick('/')}
        sx={{
          cursor: 'pointer',
          textDecoration: 'none',
          color: '#B0B0B0',
          fontSize: '0.85rem',
          '&:hover': {
            textDecoration: 'underline',
            color: '#FFFFFF',
          },
        }}
      >
        Home
      </Link>

      {breadcrumbsToUse.map((crumb, index) =>
        crumb.isLast || index === breadcrumbsToUse.length - 1 ? (
          <Typography
            key={index}
            variant="body2"
            sx={{
              color: '#FFFFFF',
              fontSize: '0.85rem',
            }}
          >
            {crumb.label}
          </Typography>
        ) : (
          <Link
            key={index}
            component="button"
            variant="body2"
            onClick={() => crumb.path && handleBreadcrumbClick(crumb.path)}
            sx={{
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#B0B0B0',
              fontSize: '0.85rem',
              '&:hover': {
                textDecoration: 'underline',
                color: '#FFFFFF',
              },
            }}
          >
            {crumb.label}
          </Link>
        )
      )}
    </MuiBreadcrumbs>
  );
}
