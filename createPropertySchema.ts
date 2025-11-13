import { PropertyDealStructure, propertyTypeValues } from '@/types/property';
import { Role } from '@/types/user';
import z from 'zod';
import { fileSchema } from '../file';
import { enumToValues } from '@/lib/utils';

export const inviteUsersSchema = z.object({
  email: z.string().email('Enter a valid email'),
  roles: z
    .array(z.enum(Object.values(Role) as [Role, ...Role[]], { message: 'Select a valid role' }))
    .min(1, 'At least one role must be selected'),
});

export const createPropertySchema = z
  .object({
    propertyName: z.string().min(1, 'Property name is required.'),
    propertyTypes: z
      .array(z.enum(propertyTypeValues))
      .min(1, 'At least one property type must be selected'),
    dealStructure: z
      .string()
      .nonempty('Deal Structure is required')
      .refine((val) => val === '' || enumToValues(PropertyDealStructure).includes(val), {
        message: 'Deal Structure must be one of: For Lease, For Sale, Hybrid Tokenizable',
      }),
    address: z.string().min(1, 'Address is required.'),
    landSize: z.string().min(1, 'Area is required.'),
    grossBuildingArea: z.string().min(1, 'Gross building area is required,'),
    yearBuilt: z.string().min(4, 'Please enter valid year'),
    invites: z.array(inviteUsersSchema).optional(),
    documents: z
      .array(fileSchema)
      .min(3, { message: 'Minimum 3 attachments are required. Please add more attachments' }),
    city: z.string().min(1, 'City is required.'),
    state: z.string().min(1, 'State is required.'),
    country: z.string().min(1, 'Country is required.'),
    zipCode: z.string().min(1, 'Zip Code is required.'),
    // Owner Information
    ownerName: z.string().min(1, 'Owner name is required'),
    ownerPhoneNumber: z
      .string()
      .min(1, 'Owner phone number is required')
      .regex(/^\d+$/, 'Phone number must contain only numbers')
      .min(10, 'Phone number must be at least 10 digits')
      .max(15, 'Phone number must not exceed 15 digits'),
    ownerEmail: z.string().email('Enter a valid email address').min(1, 'Owner email is required'),
    ownerCompany: z.string().min(1, 'Owner company is required'),
  })
  .refine(
    (data) => {
      if (!data.invites) return true;
      const emails = data.invites.map((i) => i.email.toLowerCase().trim());
      return new Set(emails).size === emails.length;
    },
    {
      message: 'Each invite email must be unique',
      path: ['invites'],
    }
  );

export type createPropertyFormData = z.infer<typeof createPropertySchema>;
