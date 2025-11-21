'use client';

import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  CircularProgress,
  Grid,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Close } from '@mui/icons-material';
import type { SxProps, Theme } from '@mui/material';
import { PropertyResponse, utilitiesTypesValues, PropertyAttachment } from '@/types/property';
import { PropertyTypeLabels } from '@/lib/constants/property';
import { useState, useMemo, useRef, useEffect } from 'react';
import { propertyService } from '@/services/propertyService';
import { useAppStore } from '@/store/appStore';
import UtilitiesEditView from './UtilitiesEditView';
import OverviewEditModal from './OverviewEditModal';
import { formatDate } from '@/lib/utils';
import { validateUtilitiesAttachments } from '@/lib/utils/property';
import { CustomCard, CustomCardContent, CustomTypography, CustomFileUpload } from '@/components/ui';
import Masonry from '@mui/lab/Masonry';
import BlockchainDetails from '@/components/AuditLogs/BlockchainDetails';
import OwnershipHistory from '@/components/AuditLogs/OwnershipHistory';
import AttachDocument from '@/components/createManualPropertyForm/AttachDocument';
import { propertyDocuments } from '@/lib/constants/property';
import { List, ListItem, ListItemText } from '@mui/material';

interface OverviewProps {
  property: PropertyResponse;
  onPropertyUpdate: (showLoading: boolean) => void | Promise<void>;
  isEditMode?: boolean;
}

const iconMap: Record<string, string> = {
  Power: '/create-manual-property/power.svg',
  Water: '/create-manual-property/water.svg',
  Gas: '/create-manual-property/gas.svg',
  Internet: '/create-manual-property/internet.svg',
  Parking: '/create-manual-property/parking.svg',
  Safety: '/create-manual-property/safety.svg',
  HVAC: '/create-manual-property/hvac.svg',
  'EV Charging': '/create-manual-property/ev-charging.svg',
  'Waste/Recycle': '/create-manual-property/waste-recycle.svg',
};

function InfoRow({
  label,
  value,
  varient = 'light',
}: {
  label: string;
  value: string | number | undefined;
  varient?: 'light' | 'dark';
}) {
  return (
    <Box
      sx={{
        p: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: varient === 'light' ? '#1C1C1C' : '',
      }}
    >
      <CustomTypography color="darkGray" sx={{ fontWeight: 400, width: '50%' }}>
        {label}
      </CustomTypography>
      <CustomTypography sx={{ fontWeight: 500, textAlign: 'left', flex: 1 }}>
        {value ?? 'N/A'}
      </CustomTypography>
    </Box>
  );
}
interface ImagePreviewProps {
  attachment: PropertyAttachment;
  isEditMode: boolean;
  onDelete: (id: number) => void;
  deleting: boolean;
  remainingCount?: number;
  isLastVisibleImage?: boolean;
  remainingImages?: PropertyAttachment[];
}

function ImagePreview({
  attachment,
  isEditMode,
  onDelete,
  deleting,
  remainingCount,
  isLastVisibleImage = false,
  remainingImages = [],
}: ImagePreviewProps) {
  const theme = useTheme();

  const handleClick = () => {
    if (!isLastVisibleImage) {
      window.open(attachment.filePath, '_blank');
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        component="img"
        src={attachment.filePath}
        alt={attachment.fileName}
        onClick={handleClick}
        sx={{
          height: { xs: '160px', sm: '190px' },
          width: 'auto',
          border: `1px solid ${theme.palette.grey[800]}`,
          backgroundColor: theme.palette.background.paper,
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          opacity: isLastVisibleImage ? 0.5 : 1,
          display: 'block',
          '&:hover': {
            transform: isLastVisibleImage ? 'none' : 'scale(1.05)',
          },
        }}
      />

      {isEditMode && !isLastVisibleImage && (
        <DeleteIconButton
          loading={deleting}
          onClick={() => onDelete(attachment.id)}
          sx={{ top: 10, right: 10 }}
        />
      )}

      {/* ➕ "+N More" Overlay */}
      {isLastVisibleImage && remainingCount && remainingCount > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            color: '#FFFFFF',
            fontSize: '18px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            '&:hover .more-images-tooltip': {
              opacity: 1,
              visibility: 'visible',
              transform: 'translateY(-10px)',
            },
          }}
        >
          +{remainingCount}
          {/* 🪄 Hover Tooltip */}
          <Box
            className="more-images-tooltip"
            sx={{
              position: 'absolute',
              bottom: '100%',
              left: '0%',
              transform: 'translateX(-50%)',
              backgroundColor: '#1a1a1a',
              border: '1px solid #404040',
              borderRadius: '8px',
              p: 2,
              minWidth: '310px',
              opacity: 0,
              visibility: 'hidden',
              transition: 'all 0.3s ease',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              mb: 1,
            }}
          >
            <Typography sx={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 600, mb: 1 }}>
              Images ({remainingCount})
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {remainingImages.map((attachment) => (
                <Box
                  key={attachment.id}
                  sx={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1,
                    borderRadius: '4px',
                    backgroundColor: '#2a2a2a',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': { backgroundColor: '#333333' },
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(attachment.filePath, '_blank');
                  }}
                >
                  {/* Thumbnail */}
                  <Box
                    component="img"
                    src={attachment.filePath}
                    alt={attachment.fileName}
                    sx={{
                      width: '24px',
                      height: '24px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                    }}
                  />

                  {/* File name */}
                  <Typography
                    sx={{
                      color: '#FFFFFF',
                      fontSize: '12px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                    title={attachment.fileName}
                  >
                    {attachment.fileName}
                  </Typography>
                  {isEditMode && (
                    <DeleteIconButton
                      sx={{ top: 2, right: 5 }}
                      loading={deleting}
                      onClick={() => onDelete(attachment.id)}
                    />
                  )}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function EditIconButton({ onClick, sx }: { onClick: () => void; sx?: SxProps<Theme> }) {
  return (
    <IconButton onClick={onClick} sx={{ width: '60px', height: '60px', ...sx }}>
      <Box
        component="img"
        src="/create-manual-property/edit.svg"
        alt="Edit"
        sx={{ width: '30px', height: '30px' }}
      />
    </IconButton>
  );
}

function DeleteIconButton({
  onClick,
  sx,
  loading,
  size = 'normal',
}: {
  onClick: () => void;
  sx?: SxProps<Theme>;
  loading: boolean;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <IconButton
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={loading}
      sx={{
        position: 'absolute',
        top: 15,
        right: 15,
        color: '#FFFFFF',
        width: size === 'small' ? 24 : 32,
        height: size === 'small' ? 24 : 32,
        border: '1px solid rgba(220, 38, 38, 0.8)',
        '&:hover': {
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
        },
        '&:disabled': { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
        ...sx,
      }}
    >
      {loading ? (
        <CircularProgress size={12} sx={{ color: '#FFFFFF' }} />
      ) : (
        <Box
          component="img"
          src="/create-manual-property/cross.svg"
          alt="Delete"
          sx={{ width: size === 'small' ? 14 : 16, height: size === 'small' ? 14 : 16 }}
        />
      )}
    </IconButton>
  );
}

function UtilityCard({
  utilityName,
  iconSrc,
  isActive,
  onInfoClick,
}: {
  utilityName: string;
  iconSrc: string;
  isActive: boolean;
  onInfoClick: (utilityName: string) => void;
}) {
  return (
    <Box
      sx={{
        width: { xs: '140px', sm: '160px' },
        height: '100px',
        border: `2px ${isActive ? 'solid' : 'dashed'} ${isActive ? '#FFFFFF' : '#666666'}`,
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: isActive ? 'pointer' : 'default',
        transition: 'all 0.2s ease',
        opacity: isActive ? 1 : 0.6,
        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        '&:hover': isActive ? { backgroundColor: 'rgba(255, 255, 255, 0.15)' } : {},
      }}
    >
      <Box
        component="img"
        src={iconSrc}
        alt={utilityName}
        sx={{ width: '24px', height: '24px', mb: 1, filter: isActive ? 'none' : 'grayscale(100%)' }}
      />
      <Typography
        sx={{ color: isActive ? '#FFFFFF' : '#666666', fontSize: '14px', fontWeight: 500 }}
      >
        {utilityName}
      </Typography>
      {isActive && (
        <Box
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick(utilityName);
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#1595C5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            '&:hover': { backgroundColor: '#0F7A9B', transform: 'scale(1.1)' },
          }}
        >
          <Typography sx={{ color: '#FFFFFF', fontSize: '10px', fontWeight: 'bold' }}>i</Typography>
        </Box>
      )}
    </Box>
  );
}

export default function Overview({
  property,
  onPropertyUpdate,
  isEditMode = false,
}: OverviewProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [selectedUtility, setSelectedUtility] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<number | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [utilitiesModalOpen, setUtilitiesModalOpen] = useState(false);
  const [overviewModalOpen, setOverviewModalOpen] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{
    id: number;
    fileName: string;
  } | null>(null);
  const [selectedDocumentFiles, setSelectedDocumentFiles] = useState<File[]>([]);
  const [documentUploadError, setDocumentUploadError] = useState<string>('');
  const initialAttachmentIdsRef = useRef<number[]>([]);
  const skipNextRefUpdateRef = useRef<boolean>(false);
  const { addNotification } = useAppStore();

  const propertyId = property?.id;
  const attachmentIds = property?.otherInfo?.attachmentIds;

  useEffect(() => {
    if (propertyId) {
      // Skip updating ref if we're in the middle of a deletion (to keep save button enabled)
      if (skipNextRefUpdateRef.current) {
        skipNextRefUpdateRef.current = false;
        return;
      }

      if (attachmentIds && attachmentIds.length > 0) {
        initialAttachmentIdsRef.current = [...attachmentIds];
      } else {
        initialAttachmentIdsRef.current = [];
      }
    }
  }, [propertyId, attachmentIds]);

  useEffect(() => {
    const currentCid =
      typeof property?.documentsCID === 'string' ? property.documentsCID : undefined;
    if (currentCid) {
      console.log('Property documentsCID updated:', currentCid);
    }
  }, [property?.documentsCID, property?.name, property?.types]);

  // Memoized derived data
  const imageAttachments = useMemo(() => {
    if (
      !property.attachments ||
      !property.otherInfo?.imageIds ||
      property.otherInfo.imageIds.length === 0
    ) {
      return [];
    }
    const imageIds = property.otherInfo.imageIds;
    return property.attachments.filter((attachment) => imageIds.includes(attachment.id));
  }, [property.attachments, property.otherInfo?.imageIds]);
  // Filter attachments by attachmentIds from PropertyOtherInfo
  const nonImageAttachments = useMemo(() => {
    if (
      !property.attachments ||
      !property.otherInfo?.attachmentIds ||
      property.otherInfo.attachmentIds.length === 0
    ) {
      return [];
    }
    const attachmentIds = property.otherInfo.attachmentIds;
    return property.attachments.filter((attachment) => attachmentIds.includes(attachment.id));
  }, [property.attachments, property.otherInfo?.attachmentIds]);

  const utilities = useMemo(() => property.propertyUtilities || [], [property.propertyUtilities]);

  const displayImages = imageAttachments.slice(0);
  const remainingCount = Math.max(0, imageAttachments.length - 5);

  const overviewInfoItems = useMemo(
    () => [
      { label: 'Property ID', value: property.propertyId },
      { label: 'SmartTag ID', value: property.otherInfo?.smartTagId },
      { label: 'Land Sq. ft/Acres', value: property.otherInfo?.landSize },
      {
        label: 'Property Type',
        value: property.types
          ?.map(
            (type) => PropertyTypeLabels[type.type as keyof typeof PropertyTypeLabels] || type.type
          )
          .join(' + '),
      },
      { label: 'Market', value: property?.market },
      { label: 'Building Class', value: property?.buildingClass },
      { label: 'City', value: property.city },
      { label: 'ZIP Code', value: property.zipCode },
      { label: 'Parcel ID/APN *', value: property?.otherInfo?.parcelId_or_apn },
      { label: 'Legal Address', value: property.otherInfo?.legalPropertyAddress },
      { label: 'Sale Price', value: '$' + property.otherInfo?.lastSale_or_rentPrice },
      { label: 'Address', value: property.address },
      { label: 'Use (County Ink)', value: property.otherInfo?.use },
      { label: 'Gross Building Area', value: property.otherInfo?.grossBuildingArea },
      { label: 'Occupancy Type', value: 'Multi-Tenant' },
      { label: 'Sub-market', value: property.subMarket },
      { label: 'Year Built', value: '2010' },
      { label: 'State', value: property.state },
      { label: 'Country', value: property.country },
      { label: 'Lease Status', value: property.otherInfo?.leaseStatus },
      {
        label: 'Safety (Last Inspection)',
        value: property?.otherInfo?.safety ? formatDate(property.otherInfo.safety) : 'N/A',
      },
    ],
    [property]
  );

  const propertyOwnerInfoItems = useMemo(
    () => [
      { label: 'Name', value: property?.ownerInfo?.name },
      { label: 'Contact', value: property?.ownerInfo?.phoneNumber },
      { label: 'Email', value: property?.ownerInfo?.email },
      { label: 'Company', value: property?.ownerInfo?.company },
    ],
    [property]
  );

  const highlightedInfoItems = useMemo(() => {
    const result = [];
    const itemsCount = overviewInfoItems.length;

    for (let i = 0; i < itemsCount; i++) {
      if (isMobile) {
        if (i % 2 === 0) result.push(i);
      } else {
        const group = Math.floor(i / 2);
        if (group % 2 === 0) result.push(i);
      }
    }

    return new Set(result);
  }, [overviewInfoItems, isMobile]);

  const handleDeleteAttachment = async (attachmentId: number) => {
    try {
      setDeletingAttachmentId(attachmentId);
      await propertyService.deleteAttachment(property.id, attachmentId.toString());

      // Don't update the ref immediately - keep it so save button stays enabled
      // The ref will be updated after user clicks save and syncs to blockchain
      skipNextRefUpdateRef.current = true;

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Attachment deleted successfully!',
      });
      onPropertyUpdate(false);
    } catch (error) {
      console.log('Failed to delete attachment:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete attachment.',
      });
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingImages(true);
    try {
      const fileArray = Array.from(files);
      await propertyService.uploadAttachments(property.id, fileArray);

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Images uploaded successfully!',
      });

      onPropertyUpdate(false);
    } catch (error) {
      console.error('Failed to upload images:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to upload images.',
      });
    } finally {
      setUploadingImages(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const getUtilityDescription = (utilityName: string): string => {
    const utility = utilities.find((util) => util.utility === utilityName);
    return utility?.description || 'No description available.';
  };

  const handleInfoClick = (utilityName: string) => {
    const isActive = utilities.some((utility) => utility.utility === utilityName);
    if (isActive) {
      setSelectedUtility({
        name: utilityName,
        description: getUtilityDescription(utilityName),
      });
      setDialogOpen(true);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedUtility(null);
  };

  const openOverviewModal = () => {
    setOverviewModalOpen(true);
  };

  const closeOverviewModal = () => {
    setOverviewModalOpen(false);
  };

  const openUtilitiesModal = () => {
    setUtilitiesModalOpen(true);
  };

  const closeUtilitiesModal = () => {
    setUtilitiesModalOpen(false);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setAttachmentToDelete(null);
  };

  const confirmDeleteAttachment = () => {
    if (attachmentToDelete) {
      handleDeleteAttachment(attachmentToDelete.id);
    }
  };

  const handleDocumentFileSelect = (files: File[]) => {
    setSelectedDocumentFiles(files);
    setDocumentUploadError('');
  };

  const handleDocumentFileRemove = (files: File[]) => {
    setSelectedDocumentFiles(files);
  };

  useEffect(() => {
    if (documentUploadError) {
      const newFilesCount = selectedDocumentFiles.length;
      const existingFilesCount = nonImageAttachments.length;
      const validation = validateUtilitiesAttachments(newFilesCount, existingFilesCount);

      if (validation.isValid) {
        setDocumentUploadError('');
      }
    }
  }, [selectedDocumentFiles, nonImageAttachments.length, documentUploadError]);

  const handleDocumentUpload = async () => {
    setUploadingDocuments(true);
    try {
      const newFilesCount = selectedDocumentFiles.length;
      const existingFilesCount = nonImageAttachments.length;
      const validation = validateUtilitiesAttachments(newFilesCount, existingFilesCount);

      if (!validation.isValid && validation.error) {
        const errorMsg = validation.error.message;
        setDocumentUploadError(errorMsg);
        setUploadingDocuments(false);
        return;
      }

      setDocumentUploadError('');

      // Only upload if there are new files
      if (selectedDocumentFiles.length > 0) {
        await propertyService.uploadAttachments(property.id, selectedDocumentFiles);
      }

      try {
        await propertyService.syncPropertyToBlockchain(property.id);
        let successMessage = 'Synced to blockchain successfully!';
        if (selectedDocumentFiles.length > 0) {
          successMessage = 'Documents uploaded and synced to blockchain successfully!';
        }

        addNotification({
          type: 'success',
          title: 'Success',
          message: successMessage,
        });

        // Update the attachment refs with the new state and refresh property to get updated metadataCid
        try {
          const refreshedProperty = await propertyService.getPropertyById(property.id);
          const currentAttachmentIds = refreshedProperty.otherInfo?.attachmentIds || [];
          initialAttachmentIdsRef.current = [...currentAttachmentIds];
        } catch (error) {
          console.warn('Failed to update initial refs:', error);
        }

        const updateResult = onPropertyUpdate(false);
        if (updateResult instanceof Promise) {
          await updateResult;
        }
        console.log('Property refresh completed');
      } catch (syncError) {
        // Extract meaningful error message from API error
        let errorMessage = 'Failed to sync to blockchain. Please try again.';
        if (
          syncError &&
          typeof syncError === 'object' &&
          'message' in syncError &&
          typeof syncError.message === 'string'
        ) {
          errorMessage = syncError.message;
        } else if (syncError instanceof Error && syncError.message) {
          errorMessage = syncError.message;
        }
        console.warn('Blockchain sync failed:', syncError);
        addNotification({
          type: 'error',
          title: 'Error',
          message: errorMessage,
        });
      }

      setSelectedDocumentFiles([]);
      // Refresh property to get updated metadataCid after blockchain sync
      const updateResult = onPropertyUpdate(false);
      if (updateResult instanceof Promise) {
        await updateResult;
      }
    } catch (error) {
      console.error('Failed to save documents:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save documents. Please try again.';
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setUploadingDocuments(false);
    }
  };

  return (
    <>
      <Box>
        {/* Property Images Section */}
        {isEditMode && (
          <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', mb: 2 }}>
            <Box sx={{ position: 'relative', float: 'right' }}>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                id="image-upload-input"
                disabled={uploadingImages}
              />
              <Button
                variant="outlined"
                component="label"
                htmlFor="image-upload-input"
                disabled={uploadingImages}
                sx={{
                  borderColor: '#666666',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  px: 2,
                  py: 1,
                  textTransform: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  '&:hover': {
                    borderColor: '#1595C5',
                    backgroundColor: 'rgba(21, 149, 197, 0.1)',
                  },
                  '&:disabled': {
                    borderColor: '#404040',
                    color: '#666666',
                  },
                }}
              >
                {uploadingImages ? (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                ) : (
                  <Box
                    component="img"
                    src="/create-manual-property/upload.svg"
                    alt="Upload"
                    sx={{ width: '16px', height: '16px', mr: 1 }}
                  />
                )}
                {uploadingImages ? 'Uploading...' : 'Upload'}
              </Button>
            </Box>
          </Box>
        )}
        {imageAttachments.length > 0 && (
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' }, mb: 2 }}>
            <Box sx={{ flex: { xs: 1, md: 1 }, position: 'relative' }}>
              {displayImages[0] && (
                <Box sx={{ position: 'relative' }}>
                  <Box
                    component="img"
                    src={displayImages[0].filePath}
                    alt={displayImages[0].fileName}
                    sx={{
                      height: '400px',
                      width: '100%',
                      border: `1px solid ${theme.palette.grey[800]}`,
                      backgroundColor: theme.palette.background.paper,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': { transform: 'scale(1.02)' },
                    }}
                    onClick={() => window.open(displayImages[0].filePath, '_blank')}
                  />
                  {isEditMode && (
                    <DeleteIconButton
                      loading={deletingAttachmentId === displayImages[0].id}
                      onClick={() => handleDeleteAttachment(displayImages[0].id)}
                    />
                  )}
                </Box>
              )}
            </Box>
            {/* Smaller Images Grid */}
            <Box
              sx={{
                flex: 1,
                ...(isMobile
                  ? {
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 2,
                      overflowX: 'auto',
                      whiteSpace: 'nowrap',
                      pb: 1,
                    }
                  : {}),
              }}
            >
              {isMobile ? (
                // 📱 Horizontal Scroll Layout for Mobile
                displayImages.map((img, index) => {
                  const isLastVisibleImage = index === 4 && remainingCount > 0;
                  return (
                    <Box
                      key={img.id}
                      sx={{
                        flex: '0 0 auto',
                        display: 'inline-block',
                      }}
                    >
                      <ImagePreview
                        attachment={img}
                        isEditMode={isEditMode}
                        onDelete={handleDeleteAttachment}
                        deleting={deletingAttachmentId === img.id}
                        isLastVisibleImage={isLastVisibleImage}
                        remainingCount={isLastVisibleImage ? remainingCount : 0}
                        remainingImages={isLastVisibleImage ? imageAttachments.slice(5) : []}
                      />
                    </Box>
                  );
                })
              ) : (
                // 🖥️ Masonry Layout for Desktop
                <Masonry
                  columns={{ xs: 1, sm: 2 }}
                  spacing={2}
                  sx={{
                    m: 0,
                  }}
                >
                  {displayImages.slice(1, 5).map((img, index) => {
                    const isLastVisibleImage = index === 3 && remainingCount > 0;

                    return (
                      <Box key={img.id}>
                        <ImagePreview
                          attachment={img}
                          isEditMode={isEditMode}
                          onDelete={handleDeleteAttachment}
                          deleting={deletingAttachmentId === img.id}
                          isLastVisibleImage={isLastVisibleImage}
                          remainingCount={isLastVisibleImage ? remainingCount : 0}
                          remainingImages={isLastVisibleImage ? imageAttachments.slice(5) : []}
                        />
                      </Box>
                    );
                  })}
                </Masonry>
              )}
            </Box>
          </Box>
        )}
        {/* Owner's Info Section */}
        {property.ownerInfo && !isEditMode && (
          <CustomCard sx={{ mb: 2, border: 0 }}>
            <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
              <Typography
                variant="h6"
                sx={{ color: '#FFFFFF', fontWeight: 600, fontSize: '18px', mb: 3 }}
              >
                Owner&apos;s Info
              </Typography>
              <Grid container spacing={2}>
                {propertyOwnerInfoItems.map((info, index) => (
                  <Grid size={{ xs: 12, md: 6 }} key={index}>
                    <InfoRow
                      label={info.label}
                      value={info.value}
                      varient={highlightedInfoItems.has(index) ? 'light' : 'dark'}
                    />
                  </Grid>
                ))}
              </Grid>
            </CustomCardContent>
          </CustomCard>
        )}

        {/* Overview Section */}
        {property.otherInfo && (
          <CustomCard sx={{ mb: 2, border: 0 }}>
            <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '18px',
                    pb: 0.5,
                  }}
                >
                  Overview
                </Typography>

                {/* Edit Icon */}
                {isEditMode && <EditIconButton onClick={openOverviewModal} />}
              </Box>
              <Typography variant="body1" sx={{ my: 3 }}>
                {property.otherInfo.propertyDescription}
              </Typography>
              <Grid container spacing={2}>
                {overviewInfoItems.map((info, index) => (
                  <Grid size={{ xs: 12, md: 6 }} key={index}>
                    <InfoRow
                      label={info.label}
                      value={info.value}
                      varient={highlightedInfoItems.has(index) ? 'light' : 'dark'}
                    />
                  </Grid>
                ))}
              </Grid>
            </CustomCardContent>
          </CustomCard>
        )}

        <CustomCard sx={{ mb: 2, border: 0 }}>
          <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
            <BlockchainDetails
              key={`blockchain-${property.documentsCID || 'no-cid'}-${property.name}-${
                property.types
                  ?.map((t) => t.type)
                  .sort()
                  .join('-') || 'no-types'
              }`}
              tokenId={property.tokenId as number | undefined}
              metadataCid={property.documentsCID as string | undefined}
            />
          </CustomCardContent>
        </CustomCard>

        <CustomCard sx={{ mb: 2, border: 0 }}>
          <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
            <OwnershipHistory propertyId={property.propertyId} />
          </CustomCardContent>
        </CustomCard>

        {/* Utilities Section */}
        <Box sx={{ mb: 3 }}>
          <CustomCard sx={{ mb: 2, border: 0 }}>
            <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 3,
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '18px',
                  }}
                >
                  Utilities
                </Typography>

                {isEditMode && <EditIconButton onClick={openUtilitiesModal} />}
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  justifyContent: { xs: 'center', sm: 'flex-start' },
                }}
              >
                {utilitiesTypesValues.map((utilityType) => {
                  const isActive = utilities.some((utility) => utility.utility === utilityType);
                  return (
                    <UtilityCard
                      key={utilityType}
                      utilityName={utilityType}
                      iconSrc={iconMap[utilityType] || '/create-manual-property/power.svg'}
                      isActive={isActive}
                      onInfoClick={handleInfoClick}
                    />
                  );
                })}
              </Box>
            </CustomCardContent>
          </CustomCard>
        </Box>

        {/* Attach Documents Section */}
        <CustomCard sx={{ mb: 2, border: 0 }}>
          <CustomCardContent sx={{ p: { xs: 2, md: 4 } }}>
            <Typography
              variant="h6"
              sx={{
                color: '#FFFFFF',
                fontWeight: 600,
                mb: 3,
                fontSize: '18px',
              }}
            >
              Attach Documents
            </Typography>

            <CustomTypography variant="body2" sx={{ mb: 1 }}>
              Required Documents: <span style={{ color: 'red', marginLeft: 4 }}>*</span>
            </CustomTypography>

            <List sx={{ listStyleType: 'disc', pl: 4, mb: 3 }}>
              {propertyDocuments.map((doc, idx) => (
                <ListItem key={idx} sx={{ display: 'list-item', py: 0 }}>
                  <ListItemText
                    primaryTypographyProps={{
                      variant: 'body2',
                      sx: { color: 'rgba(255,255,255,0.92)' },
                    }}
                    primary={doc}
                  />
                </ListItem>
              ))}
            </List>

            <CustomFileUpload
              variant="dropzone"
              maxFiles={5}
              maxSize={10}
              acceptedTypes={['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']}
              onFileSelect={handleDocumentFileSelect}
              disabled={uploadingDocuments}
              isRequired={false}
              enablePinataValidation={true}
              value={selectedDocumentFiles}
              existingFilesCount={nonImageAttachments.length}
              errorText={documentUploadError}
            />

            {/* Show already uploaded attachments */}
            {nonImageAttachments.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <AttachDocument
                  newSelectedFiles={selectedDocumentFiles}
                  onFileSelect={handleDocumentFileSelect}
                  onFileRemove={handleDocumentFileRemove}
                  maxFiles={5}
                  acceptedTypes={[
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.ms-powerpoint',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'image/jpeg',
                    'image/png',
                    'application/json',
                    'text/plain',
                    'text/csv',
                    'application/vnd.ms-excel',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                  ]}
                  maxSizeMB={10}
                  alreadyUploadAttachments={nonImageAttachments.map((att) => ({
                    id: att.id,
                    fileName: att.fileName,
                    fileSize: att.fileSize,
                    fileType: att.fileType || '',
                    filePath: att.filePath,
                  }))}
                  onDeleteAttachment={handleDeleteAttachment}
                  deletingAttachmentId={deletingAttachmentId}
                />
              </Box>
            )}

            {/* Save Button - Bottom Right */}
            <Box
              sx={{
                mt: 3,
                pt: 3,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <Button
                variant="contained"
                onClick={handleDocumentUpload}
                disabled={uploadingDocuments || !isEditMode}
                sx={{
                  backgroundColor: '#1595C5',
                  color: '#FFFFFF',
                  '&:hover': {
                    backgroundColor: '#0F7A9B',
                  },
                  '&:disabled': {
                    backgroundColor: '#404040',
                    color: '#9CA3AF',
                  },
                }}
              >
                {uploadingDocuments ? (
                  <>
                    <CircularProgress size={24} sx={{ color: 'white', mr: 1 }} />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </Box>
          </CustomCardContent>
        </CustomCard>

        {/* Utility Description Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { backgroundColor: '#191919', border: '1px solid #404040', borderRadius: '12px' },
          }}
        >
          <DialogTitle
            sx={{
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '20px',
              borderBottom: '1px solid #404040',
              pb: 2,
            }}
          >
            {selectedUtility?.name} Utility
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Typography sx={{ color: '#B0B0B0', fontSize: '16px', lineHeight: 1.6 }}>
              {selectedUtility?.description}
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 2 }}>
            <Button
              onClick={handleCloseDialog}
              variant="contained"
              sx={{
                backgroundColor: '#1595C5',
                color: '#FFFFFF',
                '&:hover': { backgroundColor: '#0F7A9B' },
              }}
              startIcon={<Close />}
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </Box>

      {/* Utilities Edit Modal */}
      <UtilitiesEditView
        open={utilitiesModalOpen}
        onClose={closeUtilitiesModal}
        property={property}
        onSaveSuccess={async () => {
          const result = onPropertyUpdate(false);
          if (result instanceof Promise) {
            await result;
          }
        }}
      />

      {/* Overview Edit Modal */}
      <OverviewEditModal
        open={overviewModalOpen}
        onClose={closeOverviewModal}
        property={property}
        onSaveSuccess={async () => {
          const result = onPropertyUpdate(false);
          if (result instanceof Promise) {
            await result;
          }
        }}
      />

      {/* Delete Confirmation Modal */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={closeDeleteConfirm}
        PaperProps={{
          sx: {
            backgroundColor: '#191919',
            border: '1px solid #404040',
            borderRadius: '12px',
          },
        }}
      >
        <DialogTitle
          sx={{
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: '18px',
            borderBottom: '1px solid #404040',
            pb: 2,
          }}
        >
          Confirm Delete
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ color: '#D1D1D1', fontSize: '16px' }}>
            Are you sure you want to delete{' '}
            <span style={{ color: '#FFFFFF', fontWeight: 600 }}>
              {attachmentToDelete?.fileName}
            </span>
            ?
          </Typography>
          <Typography sx={{ color: '#9CA3AF', fontSize: '14px', mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid #404040' }}>
          <Button
            onClick={closeDeleteConfirm}
            sx={{
              color: '#9CA3AF',
              borderColor: '#404040',
              '&:hover': {
                borderColor: '#666666',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteAttachment}
            disabled={deletingAttachmentId !== null}
            variant="contained"
            sx={{
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              fontWeight: 600,
              px: 3,
              py: 1.5,
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: '16px',
              '&:hover': {
                backgroundColor: '#DC2626',
              },
              '&:disabled': {
                backgroundColor: '#404040',
                color: '#9CA3AF',
              },
            }}
          >
            {deletingAttachmentId !== null ? (
              <CircularProgress size={20} sx={{ color: 'white' }} />
            ) : (
              'Delete'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
