'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { ownershipHistoryService, PropertyOwnershipHistoryData } from '@/services/ownershipHistory';
import { useAppStore } from '@/store/appStore';

interface OwnershipHistoryTableProps {
  propertyId?: string;
}

export default function OwnershipHistoryTable({ propertyId }: OwnershipHistoryTableProps) {
  const [historyData, setHistoryData] = useState<PropertyOwnershipHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPropertyId, setSearchPropertyId] = useState(propertyId || '');
  const { addNotification } = useAppStore();

  const fetchOwnershipHistory = async (id: string) => {
    if (!id.trim()) {
      setError('Please enter a property ID');
      return;
    }

    // Validate that property ID is not negative
    const numericId = parseFloat(id);
    if (numericId < 0) {
      setError('Property ID must be a positive number');
      addNotification({
        type: 'error',
        title: 'Invalid Input',
        message: 'Property ID must be a positive number',
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await ownershipHistoryService.getPropertyOwnershipHistory(id);

      if (response.success && response.data) {
        console.log('Ownership history data received:', response.data);
        setHistoryData(response.data);
        addNotification({
          type: 'success',
          title: 'Success',
          message: `Property ownership history loaded successfully (${response.data.ownershipHistory.length} records)`,
        });
      } else {
        // Handle error response from backend - NO CONSOLE ERROR, ADD TOAST
        const errorMessage = response.message || 'Failed to load property ownership history';
        setError(errorMessage);
        setHistoryData(null);
        addNotification({
          type: 'error',
          title: 'Error',
          message: errorMessage,
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load property ownership history';
      setError(errorMessage);
      setHistoryData(null);
      addNotification({
        type: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSearch = () => {
    fetchOwnershipHistory(searchPropertyId);
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

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
    if (address.length < 10) return address; // For short addresses like "Unknown"
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  useEffect(() => {
    if (propertyId) {
      setSearchPropertyId(propertyId);
      fetchOwnershipHistory(propertyId);
    }
  }, [propertyId]);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Search Section */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
        <Typography variant="h6" sx={{ color: '#FFFFFF', mb: 2 }}>
          Property Ownership History
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth
            label="Property ID"
            value={searchPropertyId}
            onChange={(e) => setSearchPropertyId(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter property ID to view ownership history"
            sx={{
              '& .MuiOutlinedInput-root': {
                color: '#FFFFFF',
                '& fieldset': {
                  borderColor: '#2A2A2A',
                },
                '&:hover fieldset': {
                  borderColor: '#40E0D0',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#40E0D0',
                },
              },
              '& .MuiInputLabel-root': {
                color: '#B0B0B0',
                '&.Mui-focused': {
                  color: '#40E0D0',
                },
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <SearchIcon />}
            sx={{
              bgcolor: '#40E0D0',
              color: '#000000',
              '&:hover': {
                bgcolor: '#36C5B8',
              },
              minWidth: 120,
            }}
          >
            {loading ? 'Loading...' : 'Search'}
          </Button>
        </Stack>
      </Paper>

      {/* Error Display */}
      {/* {error && (
        <Alert severity="error" sx={{ mb: 3, bgcolor: '#2D1B1B', color: '#FF6B6B' }}>
          {error}
        </Alert>
      )} */}

      {/* Ownership History Table */}
      {historyData && (
        <Paper sx={{ bgcolor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <Box sx={{ p: 3, borderBottom: '1px solid #2A2A2A' }}>
            <Typography variant="h6" sx={{ color: '#FFFFFF' }}>
              Ownership History
            </Typography>
            <Typography variant="body2" sx={{ color: '#B0B0B0', mt: 1 }}>
              Property ID: {historyData.propertyId} | Token ID: {historyData.tokenId}
            </Typography>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#2A2A2A' }}>
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
                  // Sort by block number descending (most recent first)
                  .sort((a, b) => b.blockNumber - a.blockNumber)
                  .map((record, index) => (
                    <TableRow
                      key={index}
                      sx={{
                        bgcolor: index === 0 ? 'rgba(255, 152, 0, 0.1)' : 'transparent',
                        // Highlight the first record(current owner) with a different color
                        borderLeft: index === 0 ? '4px solid #FF9800' : 'none',
                      }}
                    >
                      <TableCell>
                        <Chip
                          label={record.eventType}
                          size="small"
                          sx={{
                            bgcolor: record.eventType === 'MINT' ? '#4CAF50' : '#2196F3',
                            color: '#FFFFFF',
                            fontWeight: 'bold',
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#FFFFFF', fontFamily: 'monospace' }}>
                        <Tooltip title={record.fromAddress}>
                          <Box
                            component="span"
                            onClick={() => copyToClipboard(record.fromAddress, 'From Address')}
                            sx={{ cursor: 'pointer', '&:hover': { color: '#40E0D0' } }}
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
                            sx={{ cursor: 'pointer', '&:hover': { color: '#40E0D0' } }}
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
                              sx={{ cursor: 'pointer', '&:hover': { color: '#40E0D0' } }}
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
                            }}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* No Data State */}
      {!historyData && !loading && !error && (
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <Typography variant="h6" sx={{ color: '#B0B0B0', mb: 2 }}>
            No Ownership History
          </Typography>
          <Typography variant="body2" sx={{ color: '#808080' }}>
            Enter a property ID above to view ownership history
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
