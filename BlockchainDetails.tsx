'use client';

import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import { OpenInNew as OpenInNewIcon } from '@mui/icons-material';
import { BLOCKCHAIN } from '@/lib/constants';
import { CustomCard, CustomCardContent } from '../ui';

interface BlockchainDetailsProps {
  contractAddress?: string;
  tokenId?: number;
  tokenStandard?: string;
  chain?: string;
  metadataCid?: string;
}

const BlockchainDetails: React.FC<BlockchainDetailsProps> = ({
  contractAddress,
  tokenId,
  tokenStandard = 'ERC721',
  chain = BLOCKCHAIN.CHAIN_NAME,
  metadataCid,
}) => {
  const defaultContractAddress = process.env.NEXT_PUBLIC_SMART_TAGS_CONTRACT_ADDRESS;

  const etherscanBaseUrl = process.env.NEXT_PUBLIC_ETHERSCAN_BASE_URL;

  const finalContractAddress = (contractAddress || defaultContractAddress) as string;

  const handleContractAddressClick = () => {
    const etherscanUrl = `${etherscanBaseUrl as string}/address/${finalContractAddress}`;
    window.open(etherscanUrl, '_blank', 'noopener,noreferrer');
  };

  const handleTokenIdClick = () => {
    if (metadataCid && tokenId) {
      const base = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://ipfs.io/ipfs';
      const ipfsUrl = `${base}/${metadataCid}`;
      window.open(ipfsUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <CustomCard sx={{ mb: 2, border: 0 }}>
      <CustomCardContent sx={{ p: { xs: 0, md: 3 } }}>
        <Box>
          {/* Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="h6"
                sx={{
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '18px',
                  pb: 0.5,
                }}
              >
                Blockchain Details:
              </Typography>
            </Box>
          </Box>

          {/* Content */}
          <Grid container spacing={2}>
            {/* Contract Address */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 2,
                  bgcolor: '#1C1C1C',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: '#D1D1D1',
                    fontWeight: 400,
                    fontSize: '16px',
                  }}
                >
                  Contract Address
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: '#528BFF',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                      '&:hover': {
                        textDecoration: 'underline',
                      },
                    }}
                    onClick={handleContractAddressClick}
                  >
                    {formatAddress(finalContractAddress)}
                  </Typography>
                  <OpenInNewIcon
                    sx={{
                      color: '#528BFF',
                      fontSize: '16px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={handleContractAddressClick}
                  />
                </Box>
              </Box>
            </Grid>

            {/* Token ID */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 2,
                  bgcolor: '#1C1C1C',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: '#D1D1D1',
                    fontWeight: 400,
                    fontSize: '16px',
                  }}
                >
                  Token ID
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {tokenId ? (
                    <>
                      <Typography
                        variant="body2"
                        sx={{
                          color: '#528BFF',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          cursor: 'pointer',
                          '&:hover': {
                            textDecoration: 'underline',
                          },
                        }}
                        onClick={handleTokenIdClick}
                      >
                        {tokenId}
                      </Typography>
                      <OpenInNewIcon
                        sx={{
                          color: '#528BFF',
                          fontWeight: 600,
                          fontSize: '16px',
                          cursor: 'pointer',
                        }}
                        onClick={handleTokenIdClick}
                      />
                    </>
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{
                        color: '#757575',
                        fontStyle: 'italic',
                      }}
                    >
                      Not available
                    </Typography>
                  )}
                </Box>
              </Box>
            </Grid>

            {/* Token Standard */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 2,
                  // bgcolor: '#1C1C1C',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: '#D1D1D1',
                    fontWeight: 400,
                    fontSize: '16px',
                  }}
                >
                  Token Standard
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#FFFFFF',
                    fontFamily: 'monospace',
                    fontWeight: '500',
                  }}
                >
                  {tokenStandard}
                </Typography>
              </Box>
            </Grid>

            {/* Chain */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  p: 2,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: '#D1D1D1',
                    fontWeight: 400,
                    fontSize: '16px',
                  }}
                >
                  Chain
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#FFFFFF',
                    fontFamily: 'monospace',
                    fontWeight: '500',
                  }}
                >
                  {chain}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </CustomCardContent>
    </CustomCard>
  );
};

export default BlockchainDetails;
