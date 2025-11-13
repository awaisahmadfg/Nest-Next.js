'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, CircularProgress, Alert, Typography, Button } from '@mui/material';
import { propertyService } from '@/services/propertyService';
import { PropertyResponse } from '@/types/property';
import { useAppStore } from '@/store/appStore';
import FoundationalDataCard from '@/components/propertySummary/FoundationalDataCard';
import OtherInfoCard from '@/components/propertySummary/OtherInfoCard';
import UtilitiesCard from '@/components/propertySummary/UtilitiesCard';
import InvitationsCard from '@/components/propertySummary/InvitationsCard';

export default function PropertySummaryPage() {
  const params = useParams();
  const router = useRouter();
  const { addNotification } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const propertyId = params.id as string;

  const fetchProperty = useCallback(async () => {
    try {
      setLoading(true);
      const propertyData = await propertyService.getPropertyById(propertyId);
      setProperty(propertyData);
      setError(null); // Clear any previous errors
    } catch (error) {
      console.error('Failed to fetch property:', error);
      setError('Failed to load property details');
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load property details',
      });
    } finally {
      setLoading(false);
    }
  }, [propertyId, addNotification]);

  useEffect(() => {
    if (propertyId) {
      fetchProperty();
    }
  }, [propertyId, addNotification, fetchProperty]);

  const handleEdit = (section: string) => {
    // Navigate to specific step page based on section
    switch (section) {
      case '1':
        router.push(`/properties/${propertyId}/add-info`);
        break;
      case '2':
        router.push(`/properties/${propertyId}/other-info`);
        break;
      case '3':
        router.push(`/properties/${propertyId}/utilities`);
        break;
      case '4':
        router.push(`/properties/${propertyId}/invite-users`);
        break;
      default:
        router.push(`/properties/${propertyId}/add-info`);
    }
  };

  const handlePublishProperty = useCallback(async () => {
    try {
      setPublishing(true);
      await propertyService.publishProperty(propertyId);
      addNotification({
        type: 'success',
        title: 'Publishing to Blockchain',
        message:
          'Your property is being published to the blockchain. It will appear in the Active tab once the transaction is confirmed.',
      });
      router.push(`/properties?tab=draft`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish property';
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setPublishing(false);
    }
  }, [propertyId, addNotification, router]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!property) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">Property not found</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, backgroundColor: '#1a1a1a', minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography
          variant="h4"
          sx={{
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: '32px',
          }}
        >
          Summary
        </Typography>
      </Box>

      {/* Cards Container */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Foundational Data Card */}
        <FoundationalDataCard property={property} onEdit={() => handleEdit('1')} />

        {/* Other Info Card */}
        <OtherInfoCard property={property} onEdit={() => handleEdit('2')} />

        {/* Utilities Card */}
        <UtilitiesCard
          property={property}
          onEdit={() => handleEdit('3')}
          onAttachmentDeleted={fetchProperty}
        />

        {/* Invitations Card */}
        <InvitationsCard
          property={property}
          onEdit={() => handleEdit('4')}
          onInvitationDeleted={fetchProperty}
        />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
        <Button
          variant="outlined"
          onClick={() => router.push(`/properties/${propertyId}/invite-users`)}
          sx={{
            px: 4,
            py: 1,
            color: 'text.primary',
            borderColor: 'grey.400',
            '&:hover': { borderColor: 'grey.600' },
          }}
        >
          ← Back
        </Button>

        <Button
          variant="contained"
          disabled={publishing}
          onClick={handlePublishProperty}
          sx={{
            px: 4,
            color: '#fff',
            py: 1,
            backgroundColor: '#1595C5',
            '&:hover': { backgroundColor: '#0E7DA1' },
            '&:disabled': {
              backgroundColor: '#1595C5',
              opacity: 0.6,
            },
          }}
        >
          {publishing ? (
            <>
              <CircularProgress size={20} sx={{ color: '#fff', mr: 1 }} />
              Publishing...
            </>
          ) : (
            'Publish Property →'
          )}
        </Button>
      </Box>
    </Box>
  );
}
