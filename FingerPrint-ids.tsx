          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 'bold',
                color: '#FFFFFF',
                mb: 2,
              }}
            >
              Welcome to SmartTag Analytics
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: '#B0B0B0',
                mb: 4,
              }}
            >
              You are at Fingerprint ID&apos;s Page.
            </Typography>

            <Paper
              sx={{
                p: 3,
                bgcolor: '#1A1A1A',
                maxWidth: 400,
                mx: 'auto',
                border: '1px solid #2A2A2A',
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: '#40E0D0',
                  mb: 2,
                }}
              >
                User Information
              </Typography>

              <Divider sx={{ bgcolor: '#2A2A2A', mb: 2 }} />

              <Stack spacing={2} sx={{ textAlign: 'left' }}>
                <Box>
                  <Typography component="span" sx={{ color: '#B0B0B0', fontWeight: 500 }}>
                    Email:{' '}
                  </Typography>
                  <Typography component="span" sx={{ color: '#FFFFFF' }}>
                    {user?.email}
                  </Typography>
                </Box>

                <Box>
                  <Typography component="span" sx={{ color: '#B0B0B0', fontWeight: 500 }}>
                    User ID:{' '}
                  </Typography>
                  <Typography component="span" sx={{ color: '#FFFFFF' }}>
                    {user?.id}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}

export default function FingerprintIdsPage() {
  return <FingerprintIdsContent />;
}
