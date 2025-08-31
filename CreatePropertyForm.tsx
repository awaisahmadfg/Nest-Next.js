'use client';

import React, { useCallback, useState } from 'react';
import { Box, Typography, TextField, Button, Card, CardContent, MenuItem } from '@mui/material';
import AdminInviteForm from '../AdminInviteForm';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { propertyService } from '@/services/propertyService';

interface CreatePropertyFormProps {
  onCancel?: () => void;
  onSuccess: () => void;
}

const CreatePropertyForm: React.FC<CreatePropertyFormProps> = ({ onCancel, onSuccess }) => {
  const [formData, setFormData] = useState({
    propertyId: '',
    propertyType: '',
    propertyName: '',
    address: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuthStore();
  const { addNotification } = useAppStore();

  // Good practice as it will come from backend
  const PROPERTY_TYPES = [
    { value: 'residential', label: 'Residential' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'industrial', label: 'Industrial' },
    { value: 'mixed', label: 'Mixed-Use' },
  ] as const;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user?.id) {
        addNotification({
          type: 'error',
          title: 'Authentication Error',
          message: 'You must be logged in to create a property',
        });
        return;
      }
      setIsLoading(true);

      try {
        await propertyService.createProperty({
          ...formData,
          createdById: user.id,
          propertyType: formData.propertyType as
            | 'residential'
            | 'commercial'
            | 'industrial'
            | 'mixed',
        });

        addNotification({
          type: 'success',
          title: 'Success',
          message: 'Property created successfully',
        });

        onSuccess();
      } catch (error: any) {
        console.error('Property creation error:', error);

        addNotification({
          type: 'error',
          title: 'Creation Failed',
          message: error.message || 'Failed to create property. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [formData, user, onSuccess, addNotification]
  );

  const isFormValid = Object.values(formData).every((val) => val.trim() !== '');

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      {/* Header Section */}
      <Box sx={{ display: 'flex', mb: 3 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '20px', color: '#FFFFFF' }}>
          Create New Property
        </Typography>
      </Box>

      <Typography variant="body1" sx={{ color: '#E7E7E7', mb: 4 }}>
        Enter core information to set up a property profile and invite others to manage it further.
      </Typography>

      {/* Form Section */}
      <Card
        sx={{
          bgcolor: '#191919',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
            Basic Property Info
          </Typography>

          <form id="create-property-form" onSubmit={handleSubmit} autoComplete="off">
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              {/* First Row - Property ID and Property Type */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexDirection: { xs: 'column', sm: 'row' },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
                    Property ID
                  </Typography>
                  <TextField
                    fullWidth
                    variant="outlined"
                    name="propertyId"
                    value={formData.propertyId}
                    onChange={handleChange}
                    required
                    placeholder="Enter property ID"
                    InputLabelProps={{ shrink: false }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: 40,
                        borderRadius: '8px',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#E7E7E7' }}>
                    Property Type
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, propertyType: e.target.value }))
                    }
                    required
                    SelectProps={{ displayEmpty: true }}
                    InputLabelProps={{ shrink: false }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: 40,
                        borderRadius: '8px',
                      },
                    }}
                  >
                    <MenuItem value="">
                      <em>Select property type</em>
                    </MenuItem>
                    {PROPERTY_TYPES.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
              </Box>

              {/* Second Row - Property Name and Address */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexDirection: { xs: 'column', sm: 'row' },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#E7E7E7' }}>
                    Property Name
                  </Typography>
                  <TextField
                    fullWidth
                    name="propertyName"
                    value={formData.propertyName}
                    onChange={handleChange}
                    placeholder="Enter property name"
                    required
                    InputLabelProps={{ shrink: false }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: 40,
                        borderRadius: '8px',
                      },
                    }}
                  />
                </Box>

                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#E7E7E7' }}>
                    Address
                  </Typography>
                  <TextField
                    fullWidth
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Enter property address"
                    required
                    InputLabelProps={{ shrink: false }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: 40,
                        borderRadius: '8px',
                      },
                    }}
                  />
                </Box>
              </Box>
            </Box>
          </form>
        </CardContent>
      </Card>

      <Box sx={{ mt: 4 }}>
        <AdminInviteForm />
      </Box>

      {/* Action Buttons */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-start',
          gap: 2,
          mt: 4,
        }}
      >
        <Button
          variant="outlined"
          onClick={onCancel}
          sx={{
            px: 4,
            py: 1,
            color: 'text.primary',
            borderColor: 'grey.400',
            '&:hover': {
              borderColor: 'grey.600',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          form="create-property-form"
          type="submit"
          variant="contained"
          disabled={!isFormValid} // 🔹 Disable until all fields are filled
          sx={{
            px: 4,
            color: '#fff',
            py: 1,
            backgroundColor: '#1595C5',
            '&:hover': {
              backgroundColor: '#0E7DA1',
            },
          }}
        >
          Create
        </Button>
      </Box>
    </Box>
  );
};

export default CreatePropertyForm;
