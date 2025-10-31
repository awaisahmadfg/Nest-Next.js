import React from 'react';
import { Box, OutlinedInput } from '@mui/material';
import { getCountryCallingCode, getCountries } from 'react-phone-number-input';
import en from 'react-phone-number-input/locale/en.json';
import ReactCountryFlag from 'react-country-flag';

interface PhoneNumberInputProps {
  countryCode: string;
  phoneNumber: string;
  countryCodeError: string;
  phoneNumberError: string;
  onCountryCodeChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
}

export default function PhoneNumberInput({
  countryCode,
  phoneNumber,
  countryCodeError,
  phoneNumberError,
  onCountryCodeChange,
  onPhoneNumberChange,
}: PhoneNumberInputProps) {
  const countries = getCountries().map((country) => ({
    code: country,
    name: en[country],
    callingCode: getCountryCallingCode(country),
  }));

  // Get country code from calling code
  const getCountryFromCallingCode = (callingCode: string) => {
    const code = callingCode.replace(/^\+/, '');
    const foundCountry = countries.find((c) => c.callingCode === code);

    // For +1, prefer US over Canada
    if (code === '1' && foundCountry) {
      return foundCountry.code === 'US' ? foundCountry : countries.find((c) => c.code === 'US');
    }

    return foundCountry;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        backgroundColor: '#1A1A1A',
        border: countryCodeError || phoneNumberError ? '2px solid #FF4444' : '0.5px solid #888888',
        borderRadius: '8px',
        height: '40px',
        overflow: 'hidden',
        '&:hover': {
          borderColor: countryCodeError || phoneNumberError ? '#FF4444' : '#9CA3AF',
        },
        '&:focus-within': {
          borderColor: countryCodeError || phoneNumberError ? '#FF4444' : '#18ABE2',
        },
        '& .MuiInputBase-root': {
          border: 'none',
        },
      }}
    >
      {/* Country Code Input with Flag */}
      <Box
        sx={{
          width: '120px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          padding: '0 8px',
        }}
      >
        {(() => {
          const country = getCountryFromCallingCode(countryCode);
          const countryCodeToShow = country?.code || 'US';

          return (
            <ReactCountryFlag
              countryCode={countryCodeToShow}
              svg
              style={{
                width: '16px',
                height: '12px',
                borderRadius: '2px',
              }}
              title={country?.name || 'United States'}
            />
          );
        })()}
        <OutlinedInput
          value={countryCode}
          onChange={(e) => onCountryCodeChange(e.target.value)}
          placeholder="+1"
          error={!!countryCodeError}
          sx={{
            flex: 1,
            height: '46px',
            backgroundColor: 'transparent',
            border: 'none',
            '& .MuiOutlinedInput-notchedOutline': {
              border: 'none',
            },
            '& .MuiOutlinedInput-input': {
              color: countryCodeError ? '#FF4444' : '#666',
              fontSize: '0.875rem',
              textAlign: 'left',
              padding: '0',
              '&::placeholder': {
                color: '#666',
                opacity: 1,
              },
            },
          }}
        />
      </Box>

      {/* Divider */}
      <Box
        sx={{
          width: '1px',
          backgroundColor: '#333333',
          height: '32px',
          alignSelf: 'center',
        }}
      />

      {/* Phone Number Input */}
      <OutlinedInput
        value={phoneNumber}
        onChange={(e) => onPhoneNumberChange(e.target.value)}
        placeholder="634 448 744"
        error={!!phoneNumberError}
        sx={{
          flex: 1,
          height: '40px',
          backgroundColor: 'transparent',
          border: 'none',
          '& .MuiOutlinedInput-notchedOutline': {
            border: 'none',
          },
          '& .MuiOutlinedInput-input': {
            color: phoneNumberError ? '#FF4444' : 'white',
            fontSize: '0.875rem',
            padding: '0 12px',
            '&::placeholder': {
              color: '#666',
              opacity: 1,
            },
          },
        }}
      />
    </Box>
  );
}
