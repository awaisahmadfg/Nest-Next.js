'use client';

import * as React from 'react';
import { Box, Card, CardContent, Typography, TextField, MenuItem, Button } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';

type RoleValue = 'admin' | 'manager' | 'member';
type MemberRow = { email: string; role: RoleValue | '' };

export interface AdminInviteFormProps {
  onSubmit?: (payload: MemberRow[]) => void;
  onCancel?: () => void;
  initialRows?: MemberRow[];
  roles?: { value: RoleValue; label: string }[];
}

const DEFAULT_ROLES: AdminInviteFormProps['roles'] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AdminInviteForm: React.FC<AdminInviteFormProps> = ({
  onSubmit,
  onCancel,
  initialRows,
  roles = DEFAULT_ROLES,
}) => {
  const [rows, setRows] = React.useState<MemberRow[]>(
    initialRows?.length
      ? initialRows
      : [
          { email: '', role: '' },
          { email: '', role: '' },
        ]
  );
  const [touched, setTouched] = React.useState<Record<number, boolean>>({});

  const setRow = React.useCallback((i: number, patch: Partial<MemberRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }, []);

  const addRow = React.useCallback(() => {
    setRows((prev) => [...prev, { email: '', role: '' }]);
  }, []);

  const removeRow = React.useCallback((i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setTouched((t) => {
      const n = { ...t };
      delete n[i];
      return n;
    });
  }, []);

  const isRowValid = React.useCallback(
    (r: MemberRow) => emailRegex.test(r.email.trim()) && !!r.role,
    []
  );

  const allValid = rows.length > 0 && rows.every(isRowValid);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!allValid) {
        setTouched(Object.fromEntries(rows.map((_, i) => [i, true])));
        return;
      }
      onSubmit?.(rows.map((r) => ({ email: r.email.trim(), role: r.role })));
    },
    [allValid, onSubmit, rows]
  );

  const inputOutline = {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.32)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.48)' },
    color: 'rgba(255,255,255,0.92)',
  };

  return (
    <Card
      component="section"
      sx={{
        bgcolor: '#151515',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        color: 'rgba(255,255,255,0.92)',
      }}
    >
      <CardContent sx={{ p: '32px' }}>
        <Typography variant="h6" sx={{ fontSize: '20px', fontWeight: 600, mb: 2 }}>
          Invite Members
        </Typography>

        {/* Header labels */}
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mb: 1.5,
            px: 0.5,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* <Typography
            variant="caption"
            sx={{ color: '#FFFFFF', flex: '1 1 300px', fontSize: '14px', fontWeight: 500 }}
          >
            Email Address
          </Typography> */}
          {/* <Typography
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.65)', flex: '0 1 240px', minWidth: 200 }}
          >
            Role
          </Typography> */}
          <Box sx={{ flex: '0 0 auto', width: { xs: '100%', sm: 120 } }} />
        </Box>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          {rows.map((row, i) => {
            const showEmailErr = touched[i] && row.email !== '' && !emailRegex.test(row.email);
            const showRoleErr = touched[i] && row.role === '';

            return (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  gap: 2,
                  alignItems: 'center',
                  mb: 1.5,
                  pb: 0.5,
                  flexWrap: 'wrap',
                }}
              >
                {/* Email */}
                <Box sx={{ flex: 1, borderRadius: '8px', minWidth: 240 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
                      Email Address
                    </Typography>
                    <TextField
                      fullWidth
                      variant="outlined"
                      name="emailAddress"
                      placeholder="Email Address"
                      required
                      value={row.email}
                      onChange={(e) => setRow(i, { email: e.target.value })}
                      onBlur={() => setTouched((t) => ({ ...t, [i]: true }))}
                      error={Boolean(showEmailErr)}
                      helperText={showEmailErr ? 'Enter a valid email' : ' '}
                      InputProps={{ sx: inputOutline }}
                      FormHelperTextProps={{ sx: { m: 0, minHeight: 18 } }}
                      slotProps={{ input: { autoComplete: 'off' } }}
                      InputLabelProps={{ shrink: false }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          height: 40,
                          borderRadius: '8px',
                        },
                      }}
                    />
                  </Box>
                </Box>

                {/* Role */}
                {/* <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
                    Role
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    placeholder="Select Role"
                    name="role"
                    value={row.role}
                    required
                    onChange={(e) => setRow(i, { role: e.target.value as RoleValue })}
                    onBlur={() => setTouched((t) => ({ ...t, [i]: true }))}
                    error={Boolean(showRoleErr)}
                    helperText={showRoleErr ? 'Select a role' : ' '}
                    variant="outlined"
                    InputProps={{ sx: inputOutline }}
                    FormHelperTextProps={{ sx: { m: 0, minHeight: 18 } }}
                    slotProps={{ input: { autoComplete: 'off' } }}
                    InputLabelProps={{ shrink: false }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: 40,
                        borderRadius: '8px',
                      },
                    }}
                  />
                </Box> */}
                {/* Role */}
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, mb: 1, color: '#F9F9F9' }}>
                    Role
                  </Typography>
                  <TextField
                    select
                    fullWidth
                    name="role"
                    value={row.role}
                    onChange={(e) => setRow(i, { role: e.target.value as RoleValue })}
                    onBlur={() => setTouched((t) => ({ ...t, [i]: true }))}
                    error={Boolean(showRoleErr)}
                    helperText={showRoleErr ? 'Select a role' : ' '}
                    variant="outlined"
                    InputProps={{ sx: inputOutline }}
                    FormHelperTextProps={{ sx: { m: 0, minHeight: 18 } }}
                    SelectProps={{ displayEmpty: true }} // 👈 allows placeholder-like empty option
                    sx={{ '& .MuiOutlinedInput-root': { height: 40, borderRadius: '8px' } }}
                  >
                    <MenuItem value="">
                      <em>Select Role</em>
                    </MenuItem>
                    {roles.map((r) => (
                      <MenuItem key={r.value} value={r.value}>
                        {r.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                {/* Remove */}
                <Box
                  sx={{
                    flex: '0 0 auto',
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    width: { xs: '100%', sm: 'auto' },
                    justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                  }}
                >
                  <Button
                    variant="contained"
                    onClick={() => removeRow(i)}
                    sx={{
                      bgcolor: '#E11D3F',
                      marginTop: '8px',
                      color: '#FFFFFF',
                      '&:hover': { bgcolor: '#BE123C' },
                      textTransform: 'none',
                      fontWeight: 600,
                      height: 35,
                      borderRadius: 2,
                    }}
                  >
                    Remove
                  </Button>
                </Box>
              </Box>
            );
          })}

          {/* Footer actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, flexWrap: 'wrap', gap: 1.5 }}>
            <Button
              type="button"
              onClick={addRow}
              startIcon={<AddRoundedIcon />}
              variant="outlined"
              sx={{
                borderColor: 'rgba(255,255,255,0.32)',
                color: 'rgba(255,255,255,0.92)',
                textTransform: 'none',
                fontWeight: 500,
                borderRadius: 2,
                fontSize: '14px',
                px: 2,
                py: 1,
                '&:hover': { borderColor: 'rgba(255,255,255,0.6)' },
              }}
            >
              Add more members
            </Button>

            <Box sx={{ flex: 1 }} />

            <Button
              type="button"
              onClick={onCancel}
              sx={{ textTransform: 'none', color: 'rgba(255,255,255,0.92)' }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!allValid}
              variant="contained"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                bgcolor: allValid ? '#1595C5' : 'rgba(21,149,197,0.35)',
                '&:hover': { bgcolor: allValid ? '#0E7DA1' : 'rgba(21,149,197,0.35)' },
              }}
            >
              Send Invites
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default AdminInviteForm;
