'use client';

import { useAuth } from '@/hooks/useAuth';
import { Box, Container, Typography, CircularProgress } from '@mui/material';
import OwnershipHistoryTable from '@/components/AuditLogs/OwnershipHistoryTable';
import BlockchainDetails from '@/components/AuditLogs/BlockchainDetails';

function AuditLogsContent() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#0A0A0A',
        }}
      >
        <CircularProgress size={80} thickness={2} sx={{ color: '#40E0D0' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0A0A0A' }}>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 'bold',
              color: '#FFFFFF',
              mb: 1,
            }}
          >
            Audit Logs
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: '#B0B0B0',
            }}
          >
            View property ownership history from blockchain
          </Typography>
        </Box>

        <OwnershipHistoryTable />

        {/* Blockchain Details Section */}
        <Box sx={{ mt: 4 }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 'bold',
              color: '#FFFFFF',
              mb: 2,
            }}
          >
            Blockchain Information
          </Typography>
          <BlockchainDetails
            tokenId={3596}
            metadataCid="bafybeigs5lojzzear4gyuizxgmdabdam7jftguarspv4rcxw665pkioxdy"
          />
        </Box>
      </Container>
    </Box>
  );
}

export default function AuditLogsPage() {
  return <AuditLogsContent />;
}
