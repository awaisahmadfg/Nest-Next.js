'use client';

import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import CustomButton from '@/components/ui/CustomButton';
import CustomInputField from '@/components/ui/CustomInputField';
import CustomTypography from '@/components/ui/CustomTypography';
import { useChangePassword } from '@/hooks';
import {
  MainContainer,
  FormFieldContainer,
  LabelContainer,
  InputContainer,
  ButtonSectionContainer,
  ButtonContainer,
  ButtonSpacer,
} from './ChangePassword.styles';
import { Box } from '@mui/material';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]/,
        'Password must include at least one letter, one number, and one symbol'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export default function ChangePassword() {
  const [hasChanges, setHasChanges] = useState(false);
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onSubmit',
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const watchedValues = watch();

  // Function to check if there are any changes
  const checkForChanges = useCallback(() => {
    const hasFormChanges = Object.values(watchedValues).some(
      (value) => value && value.trim() !== ''
    );
    setHasChanges(hasFormChanges);
  }, [watchedValues]);

  // Monitor changes and update hasChanges state
  React.useEffect(() => {
    checkForChanges();
  }, [checkForChanges]);

  const onSubmit = async (data: ChangePasswordFormData) => {
    try {
      await changePassword.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });

      reset();
      setHasChanges(false);
    } catch {}
  };

  return (
    <MainContainer>
      <CustomTypography
        variant="h5"
        color="white"
        sx={{
          mb: 2,
          fontWeight: 800,
          fontSize: '24px',
        }}
      >
        Change Your Password
      </CustomTypography>
      <CustomTypography
        variant="body1"
        color="gray"
        sx={{
          fontWeight: 400,
          fontSize: '14px',
          color: '#9CA3AF',
        }}
      >
        Keep your account secure by updating your password.
      </CustomTypography>

      {/* Form */}
      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          paddingTop: 4,
        }}
      >
        <FormFieldContainer>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Current Password
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('currentPassword')}
              type="password"
              placeholder="••••••••••"
              errorText={errors.currentPassword?.message}
              togglePassword={true}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#40E0D0' },
                  '&.Mui-focused': { borderColor: '#40E0D0' },
                },
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.875rem',
                  '&::placeholder': { color: '#666' },
                },
              }}
            />
          </InputContainer>
        </FormFieldContainer>

        <FormFieldContainer>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              New Password
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('newPassword')}
              type="password"
              placeholder="Enter new password"
              errorText={errors.newPassword?.message}
              togglePassword={true}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#40E0D0' },
                  '&.Mui-focused': { borderColor: '#40E0D0' },
                },
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.875rem',
                  '&::placeholder': { color: '#666' },
                },
              }}
            />
            <CustomTypography
              variant="caption"
              sx={{
                mt: 1,
                display: 'block',
                color: '#9CA3AF',
                fontSize: '0.75rem',
              }}
            >
              Must include at least 8 characters, one number, and one symbol.
            </CustomTypography>
          </InputContainer>
        </FormFieldContainer>

        <FormFieldContainer>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Confirm New Password
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('confirmPassword')}
              type="password"
              placeholder="Enter new confirm password"
              errorText={errors.confirmPassword?.message}
              togglePassword={true}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#40E0D0' },
                  '&.Mui-focused': { borderColor: '#40E0D0' },
                },
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.875rem',
                  '&::placeholder': { color: '#666' },
                },
              }}
            />
            <CustomTypography
              variant="caption"
              sx={{
                mt: 1,
                display: 'block',
                color: '#9CA3AF',
                fontSize: '0.75rem',
              }}
            >
              Must be matched to the new password.
            </CustomTypography>
          </InputContainer>
        </FormFieldContainer>

        <ButtonSectionContainer>
          <ButtonSpacer />
          <ButtonContainer>
            <CustomButton
              type="button"
              variantType="outline"
              onClick={() => {
                reset();
                setHasChanges(false);
              }}
              sx={{
                color: '#E5E7EB',
                borderColor: '#272727',
                bgcolor: 'transparent',
                borderRadius: '10px',
                height: '40px',
                fontSize: '14px',
                fontWeight: 500,
                px: 3,
                width: { xs: '100%', sm: 'auto' },
                maxWidth: { xs: '300px', sm: 'none' },
                '&:hover': {
                  borderColor: '#40E0D0',
                  color: 'white',
                },
              }}
            >
              Cancel
            </CustomButton>
            <CustomButton
              type="submit"
              variantType="primary"
              isLoading={changePassword.isPending}
              disabled={changePassword.isPending || !hasChanges}
              sx={{
                bgcolor: '#40E0D0',
                color: 'black',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 500,
                height: '40px',
                px: 4,
                width: { xs: '100%', sm: 'auto' },
                maxWidth: { xs: '300px', sm: 'none' },
                '&:hover': { bgcolor: '#36C5B5' },
                '&:disabled': { bgcolor: '#2A2A2A', color: '#666' },
              }}
            >
              Save
            </CustomButton>
          </ButtonContainer>
        </ButtonSectionContainer>
      </Box>
    </MainContainer>
  );
}
