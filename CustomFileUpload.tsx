import React, { useRef, useState } from 'react';
import { Box, Typography, styled, IconButton, Paper } from '@mui/material';
import { Close } from '@mui/icons-material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Image from 'next/image';
import { useAppStore } from '@/store/appStore';

const PINATA_SUPPORTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'application/json',
  'text/plain',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
interface CustomFileUploadProps {
  onFileSelect: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number; // in MB
  acceptedTypes?: string[];
  disabled?: boolean;
  variant?: 'button' | 'dropzone'; // 👈 NEW
  errorText?: string;
  label?: string;
  isRequired?: boolean;
  enablePinataValidation?: boolean;
  value?: File[];
  existingFilesCount?: number;
}

const StyledFileUpload = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: theme.spacing(1.5, 2),
  backgroundColor: '#2a2a2a',
  border: '1px solid #454545',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  '&:hover': {
    backgroundColor: '#3a3a3a',
    borderColor: '#1595C5',
  },
  '&.drag-over': {
    backgroundColor: '#3a3a3a',
    borderColor: '#1595C5',
  },
}));

const FileList = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  '& .file-item': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(1, 2),
    backgroundColor: '#2a2a2a',
    borderRadius: '8px',
    marginBottom: theme.spacing(1),
    '& .file-info': {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    },
    '& .file-name': {
      color: '#ffffff',
      fontSize: '0.875rem',
    },
    '& .file-size': {
      color: '#9CA3AF',
      fontSize: '0.75rem',
    },
  },
}));

const getMaxFilesErrorMessage = (
  maxFiles: number,
  remainingSlots: number,
  rejectedCount: number,
  validFilesLength: number
): string => {
  if (remainingSlots > 0) {
    if (rejectedCount > 0) {
      return `Maximum ${maxFiles} files allowed. ${rejectedCount} file${rejectedCount > 1 ? 's were' : ' was'} automatically rejected.`;
    }
    return `Maximum ${maxFiles} files allowed.`;
  }

  if (validFilesLength > 0) {
    if (validFilesLength === 1) {
      return `Maximum ${maxFiles} files allowed. The file was automatically rejected.`;
    }
    return `Maximum ${maxFiles} files allowed. All ${validFilesLength} files were automatically rejected.`;
  }

  return `Maximum ${maxFiles} files allowed.`;
};

const CustomFileUpload: React.FC<CustomFileUploadProps> = ({
  onFileSelect,
  maxFiles = 5,
  maxSize = 25,
  acceptedTypes = ['*/*'],
  disabled = false,
  variant = 'button', // 👈 default
  errorText,
  label,
  isRequired = false,
  enablePinataValidation = false,
  existingFilesCount = 0,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [maxFilesError, setMaxFilesError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addNotification } = useAppStore();

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    setMaxFilesError('');

    const newFiles = Array.from(selectedFiles);
    const validFiles = newFiles.filter((file) => {
      if (file.size > maxSize * 1024 * 1024) {
        addNotification({
          type: 'error',
          title: `Large file`,
          message: `File ${file.name} is too large. Maximum size is ${maxSize}MB.`,
        });
        return false;
      }
      // Check if file type is supported by Pinata
      if (enablePinataValidation && !PINATA_SUPPORTED_TYPES.includes(file.type)) {
        addNotification({
          type: 'error',
          title: 'Invalid File Format',
          message: `File ${file.name} format is not supported. Please upload only PDF, DOC, DOCX, JPG, PNG, JSON, TXT, CSV, XLS, XLSX, PPT, or PPTX files.`,
        });
        return false;
      }
      return true;
    });

    if (enablePinataValidation) {
      const currentTotalFiles = existingFilesCount + files.length;
      const totalFilesAfterAdd = currentTotalFiles + validFiles.length;
      if (totalFilesAfterAdd > maxFiles) {
        const remainingSlots = maxFiles - currentTotalFiles;
        const rejectedCount = validFiles.length - remainingSlots;

        if (remainingSlots > 0) {
          const filesToAdd = validFiles.slice(0, remainingSlots);
          const updatedFiles = [...files, ...filesToAdd];
          setFiles(updatedFiles);
          onFileSelect(updatedFiles);
        }

        // Generate error message using helper function
        const errorMessage = getMaxFilesErrorMessage(
          maxFiles,
          remainingSlots,
          rejectedCount,
          validFiles.length
        );
        setMaxFilesError(errorMessage);

        // Reset the file input so user can try again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
    }

    // Clear error if we successfully add files within limit
    setMaxFilesError('');
    const updatedFiles = [...files, ...validFiles];
    setFiles(updatedFiles);
    onFileSelect(updatedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    setMaxFilesError('');
    onFileSelect(updatedFiles);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      {label && (
        <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
          {label}
          {isRequired && <span style={{ color: 'red', marginLeft: 4 }}>*</span>}
        </Typography>
      )}
      {variant === 'button' && (
        <Box display="flex" flexDirection="row" alignItems="center" gap={1} width={300}>
          <StyledFileUpload
            className={dragOver ? 'drag-over' : ''}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !disabled && fileInputRef.current?.click()}
            sx={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            <Image
              src="/setup-profile/icons/chain.svg"
              alt="Chain icon"
              width={20}
              height={20}
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <Typography
              variant="body2"
              sx={{ color: '#ffffff', fontWeight: 500, fontSize: '14px' }}
            >
              Browse Files
            </Typography>
          </StyledFileUpload>
          <Typography variant="caption" sx={{ color: '#9CA3AF', fontSize: '12px', mt: '10px' }}>
            *(max files: {maxSize}MBs)
          </Typography>
        </Box>
      )}

      {variant === 'dropzone' && (
        <Paper
          variant="outlined"
          sx={{
            border: `2px dashed ${
              errorText || maxFilesError ? '#d32f2f' : 'rgba(255,255,255,0.2)'
            }`,
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <CloudUploadIcon
            fontSize="large"
            color={errorText || maxFilesError ? 'error' : 'action'}
          />
          <Typography variant="body1" sx={{ mt: 1 }}>
            Drop your files here or{' '}
            <label htmlFor="file-upload" style={{ color: '#1976d2', cursor: 'pointer' }}>
              Browse
            </label>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Files must be under {maxSize}MB and in {acceptedTypes.join(', ')} format.
          </Typography>

          {(maxFilesError || errorText) && (
            <Typography variant="caption" sx={{ color: '#d32f2f', mt: 1, display: 'block' }}>
              {maxFilesError || errorText}
            </Typography>
          )}
        </Paper>
      )}

      {/* Hidden input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={(e) => handleFileSelect(e.target.files)}
        style={{ display: 'none' }}
        disabled={disabled}
      />

      {files.length > 0 && (
        <FileList>
          {files.map((file, index) => (
            <Box key={index} className="file-item">
              <Box className="file-info">
                <Box>
                  <Typography className="file-name">{file.name}</Typography>
                  <Typography className="file-size">{formatFileSize(file.size)}</Typography>
                </Box>
              </Box>
              <IconButton size="small" onClick={() => removeFile(index)} sx={{ color: '#9CA3AF' }}>
                <Close />
              </IconButton>
            </Box>
          ))}
        </FileList>
      )}
    </Box>
  );
};

export default CustomFileUpload;
