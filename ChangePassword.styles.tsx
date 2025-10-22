import React from 'react';
import { Box, styled } from '@mui/material';

export const MainContainer = styled(Box)(({ theme }) => ({
  paddingLeft: theme.spacing(2),
  paddingRight: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    paddingLeft: 0,
    paddingRight: 0,
  },
}));

export const FormContainer = styled(Box)<{ component?: React.ElementType }>(() => ({
  display: 'flex',
  flexDirection: 'column',
}));

export const FormFieldContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  flexDirection: 'column',
  [theme.breakpoints.up('sm')]: {
    gap: theme.spacing(4),
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: theme.spacing(2),
  },
}));

export const LabelContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  minWidth: 'auto',
  [theme.breakpoints.up('sm')]: {
    width: 140,
    minWidth: 140,
  },
}));

export const InputContainer = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: '100%',
  [theme.breakpoints.up('sm')]: {
    width: '580px',
    maxWidth: '580px',
  },
}));

export const ButtonSectionContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1.8),
  display: 'flex',
  gap: theme.spacing(2),
  alignItems: 'center',
  flexDirection: 'column',
  justifyContent: 'center',
  [theme.breakpoints.up('sm')]: {
    gap: theme.spacing(3),
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
}));

export const ButtonSpacer = styled(Box)(({ theme }) => ({
  width: 0,
  minWidth: 0,
  [theme.breakpoints.up('sm')]: {
    width: 145,
    minWidth: 0,
  },
}));

export const ButtonContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(2),
  flexDirection: 'column',
  width: '100%',
  [theme.breakpoints.up('sm')]: {
    flexDirection: 'row',
    width: 'auto',
  },
}));
