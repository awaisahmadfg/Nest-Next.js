'use client';

import { Box, Button, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useEffect, useState, useCallback } from 'react';
import { useBreadcrumbStore } from '@/app/store/breadcrumbStore';
import CreatePropertyForm from '@/components/createPropertyForm';

function PropertiesContent() {
  const [activeTab, setActiveTab] = useState<number>(0);
  const { setBreadcrumbs, currentView, setCurrentView } = useBreadcrumbStore();

  const handleTabChange = useCallback((_e: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  }, []);

  const handleCreateNewPropertyClick = useCallback(() => {
    setBreadcrumbs([
      { label: 'Properties', path: '/properties' },
      { label: 'Create Property', isLast: true },
    ]);
    setCurrentView('create');
  }, [setBreadcrumbs, setCurrentView]);

  const handlePropertyCreated = useCallback(() => {
    setCurrentView('list');
    setBreadcrumbs([]);
  }, [setBreadcrumbs, setCurrentView]);

  useEffect(() => {
    return () => {
      setBreadcrumbs([]);
      setCurrentView('list');
    };
  }, [setBreadcrumbs, setCurrentView]);

  if (currentView === 'create') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 0 }}>
        <CreatePropertyForm onSuccess={handlePropertyCreated} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '42px' }}>
      {/* Header section */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: 1,
        }}
      >
        <Typography sx={{ fontWeight: 600, fontSize: '32px' }}>All Properties</Typography>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            disableElevation
            disableRipple
            startIcon={
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M4 8H20M4 16H20"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="9" cy="8" r="2" fill="currentColor" />
                <circle cx="15" cy="16" r="2" fill="currentColor" />
              </svg>
            }
            sx={{
              width: 102,
              height: 40,
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: 0,
              color: '#E6E6E6',
              bgcolor: '#1F1F1F',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)',
              '& .MuiButton-startIcon': { mr: 1.25 },
              '&:hover': {
                bgcolor: '#232323',
                borderColor: 'rgba(255,255,255,0.26)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08)',
              },
              '&:active': { bgcolor: '#1B1B1B' },
            }}
          >
            Filter
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateNewPropertyClick}
            sx={{
              textTransform: 'none',
              color: '#fff',
              backgroundColor: '#1595C5',
              '&:hover': { backgroundColor: '#0E7DA1' },
            }}
          >
            Create New Property
          </Button>
        </Box>
      </Box>

      {/* Status Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            '& .MuiTab-root': {
              color: '#B0B0B0',
              textTransform: 'none',
              fontSize: '16px',
              fontWeight: 500,
              minWidth: 'auto',
              px: 2,
              py: 1,
              '&.Mui-selected': { color: '#FFFFFF' },
            },
            '& .MuiTabs-indicator': { backgroundColor: '#1595C5', height: 2 },
          }}
        >
          <Tab label="Active" />
          <Tab label="Pending" />
          <Tab label="Closed" />
        </Tabs>
      </Box>
    </Box>
  );
}

export default function PropertiesPage() {
  return <PropertiesContent />;
}
