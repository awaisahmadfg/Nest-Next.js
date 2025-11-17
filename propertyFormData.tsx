import { PropertyResponse } from '@/types/property';
import { CreateManualPropertyFormData } from '@/lib/validations/properties/createManualProperty';
import {
  Use,
  LeaseStatus,
  PropertyDealStructure,
  BlockchainTokenization,
  Utilities,
} from '@/types/property';
import { groupInvitationsByEmail } from './invitationUtils';

export const transformPropertyToFormData = (
  propertyData: PropertyResponse
): CreateManualPropertyFormData | null => {
  if (!propertyData) return null;

  // Extract property types from PropertyTypeOnProperty relations
  const propertyTypes = propertyData.types || [];
  const isResidential = propertyTypes.some((pt) => pt.type === 'RESIDENTIAL');
  const isCommercial = propertyTypes.some((pt) => pt.type === 'COMMERCIAL');
  const isIndustrial = propertyTypes.some((pt) => pt.type === 'INDUSTRIAL');
  const isMultiFamily = propertyTypes.some((pt) => pt.type === 'MULTI_FAMILY');
  const isRetail = propertyTypes.some((pt) => pt.type === 'RETAIL');
  const isOffice = propertyTypes.some((pt) => pt.type === 'OFFICE');
  const isLandAndDevelopment = propertyTypes.some((pt) => pt.type === 'LAND_AND_DEVELOPMENT');
  const isGsa = propertyTypes.some((pt) => pt.type === 'GSA');
  const isSpecialUse = propertyTypes.some((pt) => pt.type === 'SPECIAL_USE');
  const isHospitality = propertyTypes.some((pt) => pt.type === 'HOSPITALITY');

  return {
    // Foundational Data
    propertyName: propertyData.name || '',
    address: propertyData.address || '',
    secondaryType: propertyData.secondaryType || '',
    isResidential,
    isCommercial,
    isIndustrial,
    isMultiFamily,
    isRetail,
    isOffice,
    isLandAndDevelopment,
    isGsa,
    isSpecialUse,
    isHospitality,
    buildingClass: (propertyData.buildingClass as 'A' | 'B' | 'C') || ('A' as const),
    occupancyType:
      (propertyData.occupancyType as 'Single_Tenant' | 'Multi_Tenant' | 'Vacant' | 'Land') ||
      ('Single_Tenant' as const),
    market: propertyData.market || '',
    subMarket: propertyData.subMarket || '',
    city: propertyData.city || '',
    state: propertyData.state || '',
    zipCode: propertyData.zipCode || '',
    country: propertyData.country || '',
    ownerName: propertyData.ownerInfo?.name || '',
    ownerPhoneNumber: propertyData.ownerInfo?.phoneNumber || '',
    ownerEmail: propertyData.ownerInfo?.email || '',
    ownerCompany: propertyData.ownerInfo?.company || '',
    // Other Info
    smartTagId: propertyData.otherInfo?.smartTagId?.toString() || '',
    landSqFt: propertyData.otherInfo?.landSize?.toString() || '',
    use: (propertyData.otherInfo?.use as Use) || Use.Current,
    yearBuilt: propertyData.yearBuilt?.toString() || '',
    leaseStatus: (propertyData.otherInfo?.leaseStatus as LeaseStatus) || LeaseStatus.Active,
    lastSaleDate: (() => {
      const date = propertyData.otherInfo?.lastSaleDate;
      if (date) {
        let formatted;
        if (typeof date === 'string') {
          formatted = new Date(date).toISOString().split('T')[0];
        } else {
          formatted = String(date);
        }
        return formatted;
      }
      return '';
    })(),
    dealStructure:
      (propertyData.otherInfo?.dealStructure as PropertyDealStructure) ||
      PropertyDealStructure.For_Lease,
    grossBuildingArea: propertyData.otherInfo?.grossBuildingArea?.toString() || '',
    parcelId: propertyData.otherInfo?.parcelId_or_apn?.toString() || '',
    safetyInspection: (() => {
      const date = propertyData.otherInfo?.safety;
      if (date) {
        if (typeof date === 'string') {
          return new Date(date).toISOString().substring(0, 7);
        } else {
          return new Date(date).toISOString().substring(0, 7);
        }
      }
      return '';
    })(),
    legalPropertyAddress: propertyData.otherInfo?.legalPropertyAddress || '',
    blockchainTokenization:
      (propertyData.otherInfo?.blockChain_and_tokenization as BlockchainTokenization) ||
      BlockchainTokenization.TEXT_1,
    lastSaleRentPrice: propertyData.otherInfo?.lastSale_or_rentPrice || '',
    propertyDescription: propertyData.otherInfo?.propertyDescription || '',
    // Utilities & Attachments
    utilities: propertyData.propertyUtilities?.map((util) => ({
      id: util.id?.toString() || `utility_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      utility: util.utility as Utilities,
      description: util.description,
    })) || [{ id: '', utility: 'Power', description: '' }],
    documents: [],
    // Invite Others
    invites: groupInvitationsByEmail(propertyData.inviteRoles),
  };
};
