'use client';

import React, { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { BLOCKCHAIN } from '@/lib/constants';

interface BlockchainDetailsProps {
  contractAddress?: string;
  tokenId?: number;
  tokenStandard?: string;
  chain?: string;
  metadataCid?: string;
}

const BlockchainDetails: React.FC<BlockchainDetailsProps> = ({
  contractAddress = '0xec8155c8D9B453f1c6BDe731E91468116185Cb1f',
  tokenId,
  tokenStandard = 'ERC721',
  chain = BLOCKCHAIN.CHAIN_NAME,
  metadataCid,
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    setExpanded(!expanded);
  };

  const handleContractAddressClick = () => {
    const etherscanUrl = `https://sepolia.etherscan.io/address/${contractAddress}`;
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
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          cursor: 'pointer',
        }}
        onClick={handleToggle}
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
            Blockchain details
          </Typography>
        </Box>
        <IconButton
          size="small"
          sx={{
            color: '#FFFFFF',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {/* Collapsible Content */}
      <Collapse in={expanded}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Contract Address */}
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
                {formatAddress(contractAddress)}
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

          {/* Token ID */}
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

          {/* Token Standard */}
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

          {/* Chain */}
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
        </Box>
      </Collapse>
    </Box>
  );
};

export default BlockchainDetails;
