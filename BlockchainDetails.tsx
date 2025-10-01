'use client';

import React, { useState } from 'react';
import { Box, Typography, Collapse, IconButton } from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';

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
  chain = 'Sepolia',
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
      const ipfsUrl = `https://ipfs.io/ipfs/${metadataCid}/${tokenId}`;
      window.open(ipfsUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <Box
      sx={{
        bgcolor: '#1A1A1A',
        border: '1px solid #333333',
        borderRadius: '8px',
        overflow: 'hidden',
        mb: 3,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          cursor: 'pointer',
          '&:hover': {
            bgcolor: '#222222',
          },
        }}
        onClick={handleToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 20,
              height: 20,
              bgcolor: '#40E0D0',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: '#000000',
                fontWeight: 'bold',
                fontSize: '10px',
              }}
            >
              BC
            </Typography>
          </Box>
          <Typography
            variant="h6"
            sx={{
              color: '#FFFFFF',
              fontWeight: '600',
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
        <Box sx={{ p: 2, pt: 0 }}>
          {/* Contract Address */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 1.5,
              borderBottom: '1px solid #333333',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#B0B0B0',
                fontWeight: '500',
              }}
            >
              Contract Address
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#40E0D0',
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
                  color: '#40E0D0',
                  fontSize: '16px',
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
              py: 1.5,
              borderBottom: '1px solid #333333',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#B0B0B0',
                fontWeight: '500',
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
                      color: '#40E0D0',
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
                      color: '#40E0D0',
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
              py: 1.5,
              borderBottom: '1px solid #333333',
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#B0B0B0',
                fontWeight: '500',
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
              py: 1.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: '#B0B0B0',
                fontWeight: '500',
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
