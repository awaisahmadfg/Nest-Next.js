'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import { ownershipHistoryService, PropertyOwnershipHistoryData } from '@/services/ownershipHistory';
import { useAppStore } from '@/store/appStore';

interface OwnershipHistoryProps {
  propertyId: string;
}

const OwnershipHistory: React.FC<OwnershipHistoryProps> = ({ propertyId }) => {
  const [historyData, setHistoryData] = useState<PropertyOwnershipHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useAppStore();

  const fetchOwnershipHistory = useCallback(async () => {
    if (!propertyId?.trim()) {
      return;
    }

    try {
      setLoading(true);
      const response = await ownershipHistoryService.getPropertyOwnershipHistory(propertyId);

      if (response.success && response.data) {
        setHistoryData(response.data);
      } else {
        const errorMessage = response.message || 'Failed to load property ownership history';
        addNotification({
          type: 'error',
          title: 'Error',
          message: errorMessage,
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load property ownership history';
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  }, [propertyId, addNotification]);

  // Fetch data on mount
  useEffect(() => {
    if (propertyId) {
      fetchOwnershipHistory();
    }
  }, [propertyId, fetchOwnershipHistory]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addNotification({
      type: 'success',
      title: 'Copied',
      message: `${label} copied to clipboard`,
    });
  };

  const openInExplorer = (hash: string) => {
    const explorerUrl = `https://sepolia.etherscan.io/tx/${hash}`;
    window.open(explorerUrl, '_blank');
  };

  const formatAddress = (address: string) => {
    if (!address || address === '0x0000000000000000000000000000000000000000') return 'Mint';
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
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
            Ownership History
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={40} sx={{ color: '#40E0D0' }} />
          </Box>
        ) : historyData && historyData.ownershipHistory.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#272727' }}>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Event Type</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>From Address</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>To Address</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>
                    Transaction Hash
                  </TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Block Number</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Timestamp</TableCell>
                  <TableCell sx={{ color: '#FFFFFF', fontWeight: 'bold' }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historyData.ownershipHistory
                  .sort((a, b) => b.blockNumber - a.blockNumber)
                  .map((record, index) => (
                    <TableRow
                      key={index}
                      sx={{
                        bgcolor: index === 0 ? '#121314' : 'transparent',
                      }}
                    >
                      <TableCell>
                        <Chip
                          label={record.eventType}
                          size="small"
                          sx={{
                            bgcolor: record.eventType === 'MINT' ? 'green' : 'orange',
                            color: '#FFFFFF',
                            fontWeight: 'bold',
                            py: '18px',
                            px: '12px',
                            borderRadius: '16px',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF', fontFamily: 'monospace' }}>
                        <Tooltip title={record.fromAddress}>
                          <Box
                            component="span"
                            onClick={() => copyToClipboard(record.fromAddress, 'From Address')}
                            sx={{ cursor: 'pointer', '&:hover': { color: '#18ABE2' } }}
                          >
                            {formatAddress(record.fromAddress)}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF', fontFamily: 'monospace' }}>
                        <Tooltip title={record.toAddress}>
                          <Box
                            component="span"
                            onClick={() => copyToClipboard(record.toAddress, 'To Address')}
                            sx={{ cursor: 'pointer', '&:hover': { color: '#18ABE2' } }}
                          >
                            {formatAddress(record.toAddress)}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF', fontFamily: 'monospace' }}>
                        {record.transactionHash && record.transactionHash.length > 10 ? (
                          <Tooltip title={record.transactionHash}>
                            <Box
                              component="span"
                              onClick={() => openInExplorer(record.transactionHash)}
                              sx={{ cursor: 'pointer', '&:hover': { color: '#18ABE2' } }}
                            >
                              {formatAddress(record.transactionHash)}
                            </Box>
                          </Tooltip>
                        ) : (
                          <span>{record.transactionHash || 'N/A'}</span>
                        )}
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF' }}>
                        {record.blockNumber.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF' }}>
                        {formatTimestamp(record.timestamp)}
                      </TableCell>
                      <TableCell>
                        {index === 0 ? (
                          <Chip
                            label="Current Owner"
                            size="small"
                            sx={{
                              bgcolor: '#FF9800',
                              color: '#FFFFFF',
                              fontWeight: 'bold',
                              py: '18px',
                              px: '12px',
                              borderRadius: '16px',
                            }}
                          />
                        ) : (
                          <Chip
                            label="Previous"
                            size="small"
                            sx={{
                              bgcolor: '#757575',
                              color: '#FFFFFF',
                              fontWeight: 'bold',
                              py: '18px',
                              px: '12px',
                              borderRadius: '16px',
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: '#B0B0B0' }}>
              No ownership history available
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default OwnershipHistory;
