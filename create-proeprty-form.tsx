'use client';

import React, { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  FormControl,
  FormHelperText,
} from '@mui/material';
import { useAppStore } from '@/store/appStore';
import { propertyService } from '@/services/propertyService';
import { CustomFileUpload, CustomInputField, CustomSelect, CustomTypography } from '../ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import {
  createPropertyFormData,
  createPropertySchema,
} from '@/lib/validations/properties/createProperty';
import {
  PropertyDealStrutureLabels,
  propertyDocuments,
  PropertyTypeLabels,
} from '@/lib/constants/property';
import FormRow from '../ui/FormRow';
import FormFieldWrapper from '../ui/FormFieldWrapper';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { roleOptions } from '@/lib/user';
import { PropertiesType, PropertyDealStructure } from '@/types/property';
import { useRouter } from 'next/navigation';
import { ControlledCheckboxGroup } from '../ui/ControlledCheckBoxGroup';
interface CreatePropertyFormProps {
  onCancel?: () => void;
  onSuccess?: () => void;
}

const CreatePropertyForm: React.FC<CreatePropertyFormProps> = ({ onCancel }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useAppStore();
  const propertyTypesOptions = Object.values(PropertiesType).map((type) => ({
    value: type,
    label: PropertyTypeLabels[type],
  }));

  const propertyDealStructureOptions = Object.values(PropertyDealStructure).map((type) => ({
    value: type,
    label: PropertyDealStrutureLabels[type],
  }));

  const {
    control,
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<createPropertyFormData>({
    defaultValues: {
      propertyName: '',
      address: '',
      landSize: '',
      grossBuildingArea: '',
      yearBuilt: '',
      documents: [],
      invites: [{ email: '', roles: [] }],
      propertyTypes: [],
      dealStructure: '',
      city: '',
      state: '',
      country: '',
      zipCode: '',
    },
    resolver: zodResolver(createPropertySchema),
    mode: 'onSubmit',
  });

  const {
    fields: inviteUsersFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: 'invites',
  });

  const handleCreateProperty = useCallback(
    async (values: createPropertyFormData) => {
      setIsLoading(true);

      try {
        const { documents, ...propertyData } = values;
        const formData = new FormData();
        documents!.forEach((file) => {
          formData.append('documents', file);
        });
        formData.append('propertyData', JSON.stringify(propertyData));
        await propertyService.createProperty(formData);

        addNotification({
          type: 'success',
          title: 'Success',
          message: 'Property created successfully',
        });
        router.push('/properties');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    [addNotification, router]
  );

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

      <form
        id="create-property-form"
        onSubmit={handleSubmit(handleCreateProperty)}
        autoComplete="off"
      >
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* First Row */}
              <FormRow>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('propertyName')}
                    label="Property Name"
                    placeholder="Enter property name"
                    errorText={errors.propertyName?.message}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('address')}
                    label="Address"
                    placeholder="Enter address"
                    errorText={errors.address?.message}
                  />
                </FormFieldWrapper>
              </FormRow>
              <FormRow>
                <FormFieldWrapper>
                  <CustomInputField
                    type="number"
                    isRequired
                    {...register('landSize')}
                    label="Land Sq. ft/Acres"
                    placeholder="Enter area in sq. ft"
                    errorText={errors.landSize?.message}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper>
                  <CustomInputField
                    type="number"
                    isRequired
                    {...register('grossBuildingArea')}
                    label="Gross building Area"
                    placeholder="Enter area in sq. ft"
                    errorText={errors.grossBuildingArea?.message}
                  />
                </FormFieldWrapper>
              </FormRow>

              <FormRow>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('yearBuilt')}
                    type="number"
                    label="Year Built"
                    placeholder="Enter year built."
                    errorText={errors.yearBuilt?.message}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper>
                  <Controller
                    name="dealStructure"
                    control={control}
                    render={({ field }) => {
                      const selectedOption =
                        propertyDealStructureOptions.find((opt) => opt.value === field.value)
                          ?.label ?? null;

                      return (
                        <CustomSelect
                          isRequired
                          {...field}
                          options={propertyDealStructureOptions}
                          label="Deal Structure"
                          placeholder="Select deal structure"
                          error={errors.dealStructure?.message}
                          value={selectedOption}
                          onChange={(option) => field.onChange(option)}
                        />
                      );
                    }}
                  />
                </FormFieldWrapper>
              </FormRow>
              <FormRow>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('country')}
                    label="Country"
                    placeholder="Enter country"
                    errorText={errors.country?.message}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('state')}
                    label="State"
                    placeholder="Enter state"
                    errorText={errors.state?.message}
                  />
                </FormFieldWrapper>
              </FormRow>
              <FormRow>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('city')}
                    label="City"
                    placeholder="Enter city"
                    errorText={errors.city?.message}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper>
                  <CustomInputField
                    isRequired
                    {...register('zipCode')}
                    type="number"
                    label="Zip Code"
                    placeholder="Enter zip code"
                    errorText={errors.zipCode?.message}
                  />
                </FormFieldWrapper>
              </FormRow>
              <FormControl fullWidth>
                {/* ✅ Row 1: Label */}
                <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
                  Property Types <span style={{ color: 'red', marginLeft: 4 }}>*</span>
                </Typography>

                {/* ✅ Row 2: Checkboxes */}
                <ControlledCheckboxGroup
                  name="propertyTypes"
                  control={control}
                  options={propertyTypesOptions}
                />
              </FormControl>
            </Box>
          </CardContent>
        </Card>

        <Card
          sx={{
            bgcolor: '#191919',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            color: 'rgba(255,255,255,0.92)',
            mt: 4,
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <CustomTypography variant="body2" sx={{ mb: 1 }}>
              Required Documents: <span style={{ color: 'red', marginLeft: 4 }}>*</span>
            </CustomTypography>

            <List sx={{ listStyleType: 'disc', pl: 4, mb: 2 }}>
              {propertyDocuments.map((doc, idx) => (
                <ListItem key={idx} sx={{ display: 'list-item', py: 0 }}>
                  <ListItemText primaryTypographyProps={{ variant: 'body2' }} primary={doc} />
                </ListItem>
              ))}
            </List>

            <Controller
              name="documents"
              control={control}
              defaultValue={[]}
              render={({ field }) => (
                <CustomFileUpload
                  variant="dropzone"
                  maxSize={10}
                  onFileSelect={(files) => field.onChange(files)}
                  disabled={field.disabled}
                  errorText={errors?.documents?.message}
                />
              )}
            />
          </CardContent>
        </Card>

        <Card
          sx={{
            bgcolor: '#191919',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            color: 'rgba(255,255,255,0.92)',
            mt: 4,
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Invite Members
              </Typography>

              {inviteUsersFields.map((field, index) => (
                <FormRow key={`user-invite-${index}`} sx={{ mt: 2 }}>
                  <FormFieldWrapper>
                    <Controller
                      name={`invites.${index}.email`}
                      control={control}
                      render={({ field, fieldState }) => (
                        <CustomInputField
                          isRequired
                          {...field}
                          label={index === 0 ? 'Email' : ''}
                          placeholder="Email Address"
                          errorText={fieldState.error?.message}
                        />
                      )}
                    />
                  </FormFieldWrapper>
                  <FormFieldWrapper>
                    <Controller
                      name={`invites.${index}.roles`}
                      control={control}
                      render={({ field, fieldState }) => {
                        return (
                          <CustomSelect
                            isRequired
                            {...field}
                            label={index === 0 ? 'Roles' : ''}
                            options={roleOptions}
                            placeholder="Select Roles"
                            error={fieldState.error?.message}
                            value={field.value || []}
                            onChange={(option) => field.onChange(option)}
                            multiple={true}
                          />
                        );
                      }}
                    />
                  </FormFieldWrapper>
                  {/* Remove */}
                  <Button
                    type="button"
                    variant="contained"
                    color="error"
                    onClick={() => remove(index)}
                    sx={{ height: 40, mt: index > 0 ? 0 : '30px' }}
                  >
                    Remove
                  </Button>
                </FormRow>
              ))}
              {errors?.invites?.root && (
                <FormHelperText sx={{ color: 'red', mt: 2 }}>
                  {errors?.invites?.root.message}
                </FormHelperText>
              )}
              {/* Add new row */}
              <Button
                type="button"
                onClick={() => append({ email: '', roles: [] })}
                startIcon={<AddRoundedIcon />}
                variant="outlined"
                sx={{ mt: 2 }}
              >
                Add more members
              </Button>
            </Box>
          </CardContent>
        </Card>
        {/* Action Buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', gap: 2, mt: 4 }}>
          <Button
            variant="outlined"
            onClick={onCancel}
            sx={{
              px: 4,
              py: 1,
              color: 'text.primary',
              borderColor: 'grey.400',
              '&:hover': { borderColor: 'grey.600' },
            }}
          >
            Cancel
          </Button>
          <Button
            form="create-property-form"
            type="submit"
            variant="contained"
            // disabled={!isFormValid || isLoading} // 🔹 disable if invalid or loading
            sx={{
              px: 4,
              color: '#fff',
              py: 1,
              backgroundColor: '#1595C5',
              '&:hover': { backgroundColor: '#0E7DA1' },
            }}
          >
            {isLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Create'}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default CreatePropertyForm;
