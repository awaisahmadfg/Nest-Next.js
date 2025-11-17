import { Permission } from '@/enums/permissions';
import { MenuItem } from '@/types';

export const API_ENDPOINTS = {
  DASHBOARD: {
    STATS: '/dashboard/stats',
  },
  AUTH: {
    LOGIN: '/auth/login',
    SIGNUP: '/auth/signup',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/user',
    FORGOT_PASSWORD: '/auth/request-otp',
    RESET_PASSWORD: '/auth/reset-password',
    VERIFY_TOKEN: '/auth/verify-token',
    SSO_NEXT_AUTH: '/auth/sso',
  },
  USERS: {
    PROFILE: '/auth/user',
    UPDATE_ROLE: '/profiles/update-role',
    UPDATE_PROFILE: '/auth/profile',
    CHANGE_PASSWORD: '/auth/change-password',
  },
  FILE_UPLOAD: {
    PROFILE_IMAGE: '/file-upload/profile-image',
  },
  PROFILES: {
    ROLES: '/profiles/roles',
    MY_ROLES: '/profiles/me/roles',
    UPDATE_MY_ROLES: '/profiles/me/roles',
    ALL_USERS: '/profiles',
    USER_REQUESTS: `/profiles/requests`,
    GET_USER_REQUEST: (id: string, roleStatus?: string) =>
      `/profiles/${id}${roleStatus ? `?roleStatus=${roleStatus}` : ''}`,
    UPDATE_USER_STATUS: (id: string) => `/profiles/${id}/status`,
    BULK_UPDATE_USER_ROLES: (id: string) => `/profiles/${id}/roles/bulk`,
    INVITE_USER: '/invitations',
    PLATFROM_INVITE: '/invitations/platform-invite',
    PROPERTY_INVITE: '/invitations/property-invite',
    REQUEST_ADDITIONAL_INFO: '/profiles/request-additional-info',
  },
  INVITATION: {
    ACCEPT_INVITE: '/invitations/accept-invite',
    DELETE_INVITE_FOR_PROPERTY: (propertyId: string, inviteId: string) =>
      `/invitations/property-invite/${propertyId}/${inviteId}`,
  },
  ONBOARDING: {
    SUBMIT: '/onboarding/submit',
    SUBMIT_MULTIPLE: '/onboarding/submit-multiple',
    SUBMIT_ADDITIONAL_INFO: '/onboarding/submit-additional-info',
    CHECK_ADDITIONAL_INFO: '/onboarding/check-additional-info',
  },
  PROPERTIES: {
    CREATE: '/properties',
    BULK_CREATE: '/properties/bulk',
    GET_ALL: '/properties',
    GET_PROPERTY_INVITED_USERS: (id: string) => `/properties/${id}/invited-users`,
    GET_PROPERTY_USERS: (id: string) => `/properties/${id}/users`,
    GET_PROPERTY_ACTIVITES: (id: string) => `/properties/${id}/activities`,
    GET_BY_STATUS: (status: string) => `/properties/by-status?status=${status}`,
    GET_BY_ID: (id: string) => `/properties/${id}`,
    UPDATE_FOUNDATIONAL_DATA: (id: string) => `/properties/${id}/basic-info`,
    UPDATE_OTHER_INFO: (id: string) => `/properties/${id}/other-info`,
    UPDATE_UTILITIES_ATTACHMENTS: (id: string) => `/properties/${id}/utilities-attachments`,
    UPDATE_INVITATIONS: (id: string) => `/properties/${id}/invite-users`,
    UPDATE_OVERVIEW: (id: string) => `/properties/${id}/overview`,
    UPLOAD_ATTACHMENTS: (id: string) => `/properties/${id}/attachments`,
    PUBLISH: (id: string) => `/properties/${id}/publish`,
    SYNC_BLOCKCHAIN: (id: string) => `/properties/${id}/sync-blockchain`,
    PROPERTY_HISTORY: '/blockchain/ownership-history',
    DELETE_PROPERTY_ATTACHMENT: (propertyId: string, attachmentId: string) =>
      `/properties/${propertyId}/attachments/${attachmentId}`,
    DELETE_PROPERTY_USER: (propertyId: string, userId: string) =>
      `/properties/${propertyId}/users/${userId}`,
  },
  INSPECTIONS: {
    GET_PROPERTY_INSPECTION_REPORT: (id: string) => `/inspection/property-inspection-report/${id}`,
    GET_PAST_INSPECTION_REPORT: (id: string) => `/inspection/property-past-inspection/${id}`,
    GET_OBSERVATION_DETAILS: (id: string) => `/inspection/observation/${id}`,
    ADD_TASK: '/inspection/add-task',
    EDIT_TASK: '/inspection/edit-task',
  },
  INVITATIONS: {
    GET_INVITATIONS: (inviteId: string) => `/invitations/${inviteId}`,
    DELETE_INVITATION: (inviteId: string) => `/invitations/${inviteId}`,
  },
  TAGS: {
    LIST: '/tags',
    CREATE: '/tags',
    UPDATE: (id: string) => `/tags/${id}`,
    DELETE: (id: string) => `/tags/${id}`,
    SEARCH: '/tags/search',
  },
  PUBLIC: {
    CONTACTUS: {
      CREATE: '/contact-us',
    },
  },
} as const;

export const protectedRoutes = [
  '/dashboard',
  '/profile',
  '/settings',
  '/user-management',
  '/properties',
  '/zoning-area',
  '/support',
];

export const authRoutes = ['/auth/login', '/auth/signup'];

export const onboardingRoutes = ['/onboarding', '/onboarding/confirmation'];

export const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    path: '/dashboard',
    icon: '/menu-icons/dashboard-icon.svg',
    requiredPermissions: [Permission.dashboard.VIEW_PUBLIC],
  },
  {
    title: 'Properties',
    path: '/properties',
    icon: '/menu-icons/properties-icon.svg',
    requiredPermissions: [Permission.property.VIEW],
  },
  {
    title: 'User Management',
    icon: '/menu-icons/user-management-icon.svg',
    requiredPermissions: [Permission.user_management.users_requests.VIEW],
    children: [
      {
        title: 'All Users',
        path: '/user-management/all-users',
        icon: '',
        requiredPermissions: [Permission.user_management.all_users.VIEW],
      },
      {
        title: 'Requests',
        path: '/user-management/requests',
        icon: '',
        requiredPermissions: [Permission.user_management.users_requests.VIEW],
      },
    ],
  },
  {
    title: 'Zoning & Overlays',
    path: '/zone-management',
    icon: '/menu-icons/zone-management-icon.svg',
    requiredPermissions: [Permission.zoning_management.VIEW],
  },
  {
    title: 'Fingerprint ID’s',
    path: '/fingerprint-ids',
    icon: '/menu-icons/fingerprint-icon.svg',
    requiredPermissions: [Permission.support.VIEW],
  },
  {
    title: 'Reports',
    path: '/reports',
    icon: '/menu-icons/reports-icon.svg',
    requiredPermissions: [Permission.support.VIEW],
  },
  {
    title: 'Audit Logs',
    path: '/audit-logs',
    icon: '/menu-icons/audit-icon.svg',
    requiredPermissions: [Permission.support.VIEW],
  },
  {
    title: 'Support',
    path: '/support',
    icon: '/menu-icons/support-icon.svg',
    requiredPermissions: [Permission.support.VIEW],
  },
];

export const ActivityActions = {
  PROPERTY_CREATED: 'PROPERTY_CREATED',
  PROPERTY_UPDATED: 'PROPERTY_UPDATED',
  PROPERTY_DELETED: 'PROPERTY_DELETED',
  USER_INVITED: 'USER_INVITED',
  PROPERTY_INVITE_SENT: 'PROPERTY_INVITE_SENT',
  PROPERTY_INVITE_UPDATE: 'PROPERTY_INVITE_UPDATE',
  PROPERTY_INVITE_DELETE: 'PROPERTY_INVITE_DELETE',
  PROPERTY_INVITE_ACCEPT: 'PROPERTY_INVITE_ACCEPT',
  PROPERTY_REMOVE_ATTACHMENT: 'PROPERTY_REMOVE_ATTACHMENT',
} as const;

export const BLOCKCHAIN = {
  CHAIN_NAME: process.env.NODE_ENV === 'production' ? 'Polygon Mainnet' : 'Sepolia',
} as const;
