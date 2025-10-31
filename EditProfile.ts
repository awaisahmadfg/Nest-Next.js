'use client';

import React, { useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Avatar, IconButton } from '@mui/material';
import Image from 'next/image';
import { useProfile, useUpdateProfile } from '@/hooks';
import { updateProfileSchema, UpdateProfileFormData } from '@/lib/validations';
import CustomButton from '@/components/ui/CustomButton';
import CustomInputField from '@/components/ui/CustomInputField';
import CustomTypography from '@/components/ui/CustomTypography';
import PhoneNumberInput from './PhoneNumberInput';
import { usePhoneValidation } from '@/hooks/usePhoneValidation';
import { useAppStore } from '@/store/appStore';
import { userService } from '@/services';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/authStore';
import { formatRole } from '@/lib/user';
import { useSession } from 'next-auth/react';
import {
  MainContainer,
  ProfilePictureSection,
  Spacer,
  AvatarContainer,
  ProfileInfoContainer,
  FormContainer,
  FormFieldContainer,
  FormFieldContainerWithBorder,
  LabelContainer,
  InputContainer,
  ErrorMessageContainer,
  ButtonSectionContainer,
  ButtonSpacer,
  ButtonContainer,
} from './EditProfile.styles';

export default function EditProfile() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { addNotification } = useAppStore();
  const { user } = useAuth();
  const { setUser } = useAuthStore();
  const { update: updateSession } = useSession();

  // Image upload state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use custom phone validation hook
  const {
    phoneNumber,
    countryCode,
    countryCodeError,
    phoneNumberError,
    handleCountryCodeChange,
    handlePhoneNumberChange,
    getFullPhoneNumber,
    validateForSubmission,
    resetPhoneData,
  } = usePhoneValidation();

  // Image upload handlers
  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageFile(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    setImageError(null);

    if (file) {
      if (!file.type.startsWith('image/')) {
        setImageError('Please select a valid image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setImageError('Image size should be less than 5MB');
        return;
      }

      setSelectedImageFile(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setImageError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
  });

  const watchedValues = watch();

  const checkForChanges = useCallback(() => {
    if (!profile) return false;

    const originalFullName =
      profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    const originalEmail = profile.email || '';
    const originalCompany = profile.company || '';
    const originalPhone = profile.phone || '';

    const normalize = (v?: string | null) => (v ? v.trim() : '');

    const current = {
      fullName: normalize(watchedValues.fullName),
      email: normalize(watchedValues.email ?? originalEmail),
      company: normalize(watchedValues.company),
      // phone: normalize(getFullPhoneNumber()),
    };

    const original = {
      fullName: normalize(originalFullName),
      email: normalize(originalEmail),
      company: normalize(originalCompany),
      phone: normalize(originalPhone),
    };

    const hasFieldChanges = Object.keys(current).some(
      (key) =>
        (current as Record<string, string>)[key] !== (original as Record<string, string>)[key]
    );

    // Check if image has changed (only if a new file is selected)
    const hasImageChanged = selectedImageFile !== null;

    // Return true if either form fields changed OR image changed
    return hasFieldChanges || hasImageChanged;
  }, [profile, watchedValues, selectedImageFile]);

  // Monitor changes and update hasChanges state
  React.useEffect(() => {
    const hasFormChanges = checkForChanges();
    setHasChanges(hasFormChanges);
  }, [checkForChanges]);

  // Auto Populate the profile data on reload
  React.useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.fullName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
        email: profile.email || '',
        company: profile.company || '',
        profileImageUrl:
          (profile as unknown as { profileImageUrl?: string })?.profileImageUrl || '',
      });

      // Reset phone data using the hook function
      // resetPhoneData(profile.phone);
    }
  }, [profile, reset, resetPhoneData]);

  const onSubmit = async (data: UpdateProfileFormData) => {
    setImageError(null);

    // Start loading immediately if there's an image to upload
    if (selectedImageFile) {
      setIsUploadingImage(true);
    }

    // Validate phone data before submission
    if (!validateForSubmission()) {
      // Log detailed validation context to help diagnose why Save didn't run
      // Note: country/phone validation is handled by usePhoneValidation
      // and may block submission if invalid
      console.error('EditProfile: submission blocked by validation', {
        countryCode,
        phoneNumber,
        countryCodeError,
        phoneNumberError,
      });
      addNotification({
        type: 'error',
        title: 'Validation Failed',
        message: 'Please fix phone/country code errors and try again.',
      });
      return;
    }

    const fullPhoneNumber = getFullPhoneNumber();
    console.log('EditProfile: phone data:', {
      countryCode,
      phoneNumber,
      fullPhoneNumber,
      countryCodeError,
      phoneNumberError,
    });

    // Upload image first if a new image was selected
    let imageUrl = '';
    if (selectedImageFile) {
      try {
        const { url } = await userService.uploadProfileImage(selectedImageFile);
        imageUrl = url;
      } catch (err) {
        console.error('EditProfile: failed to upload profile image', err);
        setIsUploadingImage(false);
        addNotification({
          type: 'error',
          title: 'Upload Failed',
          message: 'Could not upload profile picture. Please try again.',
        });
        return;
      } finally {
        setIsUploadingImage(false);
      }
    }

    // Get original email for fallback
    const originalEmail = profile?.email || '';

    // Prepare the data for submission (ensure email stays same if disabled)
    const { ...sanitized } = data as Record<string, unknown>;
    const profileData = {
      ...(sanitized as UpdateProfileFormData),
      email: (data.email ?? originalEmail) as string,
      // phone: fullPhoneNumber || undefined, // Only include phone if it has a value
      profileImageUrl:
        imageUrl || (data as { profileImageUrl?: string }).profileImageUrl || undefined,
    };

    // Call the backend update endpoint
    updateProfile.mutate(profileData, {
      onSuccess: async (response) => {
        // Clear the selected image file after successful upload
        if (selectedImageFile) {
          setSelectedImageFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }

        // Reset changes state after successful save
        setHasChanges(false);
        setIsUploadingImage(false);

        if (user && response) {
          const responseWithImageUrl = response as { profileImageUrl?: string };
          const updatedUser = {
            ...user,
            fullName: response.fullName || user.fullName,
            avatar: response.avatar || responseWithImageUrl.profileImageUrl || user.avatar,
          };
          setUser(updatedUser);
        }

        if (user) {
          const responseWithImageUrl = response as { profileImageUrl?: string };
          await updateSession({
            user: {
              ...user,
              fullName: response.fullName || user.fullName,
              avatar: response.avatar || responseWithImageUrl.profileImageUrl || user.avatar,
            },
          });
        }

        addNotification({
          type: 'success',
          title: 'Profile Updated',
          message: 'Your profile has been updated successfully.',
        });
      },
      onError: (error) => {
        console.error('EditProfile: failed to update profile', error);
        addNotification({
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update profile. Please try again.',
        });
      },
    });
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
        Personal Info
      </CustomTypography>
      <CustomTypography
        variant="body1"
        color="gray"
        sx={{
          mb: 6,
          fontWeight: 400,
          fontSize: '14px',
          color: '#9CA3AF',
        }}
      >
        Manage your personal details, account information and basic preferences.
      </CustomTypography>

      {/* Profile Picture Section */}
      <ProfilePictureSection>
        {/* spacer to align with input start */}
        <Spacer />
        <AvatarContainer>
          <Avatar
            src={
              selectedImage ||
              (profile as unknown as { profileImageUrl?: string })?.profileImageUrl ||
              profile?.avatar ||
              undefined
            }
            sx={{
              width: 112,
              height: 112,
              bgcolor: '#262626',
              border: '2px solid #333',
              fontSize: '2rem',
              '& img': {
                objectFit: 'cover',
                width: '100%',
                height: '100%',
              },
            }}
          >
            {!selectedImage &&
              !profile?.avatar &&
              (profile?.fullName || 'U').charAt(0).toUpperCase()}
          </Avatar>
          <IconButton
            onClick={handleImageClick}
            sx={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 28,
              height: 28,
              p: 0,
              '&:hover': {
                transform: 'scale(1.05)',
                transition: 'transform 0.2s ease',
              },
            }}
          >
            <Image src="/icons/edit-profile.svg" alt="Edit Profile" width={28} height={28} />
          </IconButton>
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          {/* Image error display */}
          {imageError && (
            <CustomTypography
              variant="caption"
              sx={{
                color: '#FF4444',
                fontSize: '0.75rem',
                mt: 1,
                display: 'block',
                textAlign: 'center',
              }}
            >
              {imageError}
            </CustomTypography>
          )}
        </AvatarContainer>
        <ProfileInfoContainer>
          <CustomTypography
            variant="h5"
            color="white"
            sx={{ fontSize: '24px', fontWeight: 600, mb: 0.5 }}
          >
            Profile Picture
          </CustomTypography>
          <CustomTypography
            variant="body2"
            sx={{
              color: '#9CA3AF',
              fontWeight: 400,
              fontSize: '14px',
            }}
          >
            Upload or change your photo for easy identification.
          </CustomTypography>
        </ProfileInfoContainer>
      </ProfilePictureSection>

      {/* Form */}
      <FormContainer
        component="form"
        onSubmit={handleSubmit(onSubmit, (errors) => {
          console.log('EditProfile: form validation failed:', errors);
        })}
      >
        <FormFieldContainer>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Full name
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('fullName')}
              placeholder="Enter full name"
              errorText={errors.fullName?.message}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#9CA3AF' },
                  '&.Mui-focused': { borderColor: '#18ABE2' },
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

        <FormFieldContainerWithBorder>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Email Address
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('email')}
              placeholder="lyle@kauffmancompany.com"
              disabled
              errorText={errors.email?.message}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#9CA3AF' },
                  '&.Mui-focused': { borderColor: '#18ABE2' },
                },
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.875rem',
                  '&::placeholder': {
                    color: 'white',
                    opacity: 1,
                  },
                },
              }}
            />
            <CustomTypography
              variant="caption"
              sx={{
                display: 'block',
                color: '#9CA3AF',
                fontSize: '0.75rem',
              }}
            >
              Contact to your team to manage your email.
            </CustomTypography>
          </InputContainer>
        </FormFieldContainerWithBorder>

        <FormFieldContainerWithBorder>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Company
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              {...register('company')}
              placeholder="Enter company name"
              errorText={errors.company?.message}
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '0.5px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#9CA3AF' },
                  '&.Mui-focused': { borderColor: '#18ABE2' },
                },
                '& .MuiInputBase-input': {
                  color: 'white',
                  fontSize: '0.875rem',
                  '&::placeholder': { color: '#666' },
                },
              }}
            />
          </InputContainer>
        </FormFieldContainerWithBorder>

        <FormFieldContainerWithBorder>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Phone Number
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <PhoneNumberInput
              countryCode={countryCode}
              phoneNumber={phoneNumber}
              countryCodeError={countryCodeError}
              phoneNumberError={phoneNumberError}
              onCountryCodeChange={handleCountryCodeChange}
              onPhoneNumberChange={handlePhoneNumberChange}
            />
            {(countryCodeError || phoneNumberError) && (
              <ErrorMessageContainer>
                <CustomTypography
                  variant="caption"
                  sx={{
                    color: '#FF4444',
                    fontSize: '0.75rem',
                  }}
                >
                  {countryCodeError || phoneNumberError}
                </CustomTypography>
              </ErrorMessageContainer>
            )}
          </InputContainer>
        </FormFieldContainerWithBorder>

        <FormFieldContainerWithBorder>
          <LabelContainer>
            <CustomTypography
              variant="body2"
              color="white"
              sx={{ fontWeight: 400, mb: { xs: 1, sm: 0 } }}
            >
              Role
            </CustomTypography>
          </LabelContainer>
          <InputContainer>
            <CustomInputField
              value={user?.selectedRole ? formatRole(user.selectedRole) : 'Loading...'}
              disabled
              sx={{
                '& .MuiInputBase-root': {
                  bgcolor: '#1A1A1A',
                  border: '1px solid #888888',
                  borderRadius: '8px',
                  height: '40px',
                  '&:hover': { borderColor: '#40E0D0' },
                  '&.Mui-focused': { borderColor: '#40E0D0' },
                },
                '& .MuiInputBase-input': {
                  color: '#666',
                  fontSize: '0.875rem',
                },
                '& .MuiInputBase-input.Mui-disabled': {
                  WebkitTextFillColor: 'white !important',
                },
              }}
            />
          </InputContainer>
        </FormFieldContainerWithBorder>

        <ButtonSectionContainer>
          {/* spacer to align with input start */}
          <ButtonSpacer />
          <ButtonContainer>
            <CustomButton
              type="button"
              variantType="outline"
              onClick={() => {
                reset({
                  fullName: '',
                  email: '',
                  company: '',
                  profileImageUrl: '',
                });
                clearSelectedImage();
                setHasChanges(false);
                setIsUploadingImage(false);
              }}
              sx={{
                color: '#E5E7EB',
                borderColor: '#272727',
                bgcolor: '#1A1A1A',
                borderRadius: '10px',
                height: '40px',
                fontSize: '14px',
                fontWeight: 500,
                px: 3,
                width: { xs: '100%', sm: 'auto' },
                maxWidth: { xs: '300px', sm: 'none' },
                '&:hover': {
                  borderColor: '#18ABE2',
                  color: 'white',
                },
              }}
            >
              Discard
            </CustomButton>
            <CustomButton
              type="submit"
              variantType="primary"
              isLoading={updateProfile.isPending || isUploadingImage}
              disabled={updateProfile.isPending || isUploadingImage || !hasChanges}
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
      </FormContainer>
    </MainContainer>
  );
}
