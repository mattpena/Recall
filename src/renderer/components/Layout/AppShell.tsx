import React from 'react'
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Avatar, Divider } from '@mui/material'
import { Home, Description, Chat, Label, Settings } from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

const DRAWER_WIDTH = 220

const navItems = [
  { path: '/home', label: 'Today', icon: <Home /> },
  { path: '/transcripts', label: 'Meeting Notes', icon: <Description /> },
  { path: '/chat', label: 'Chat', icon: <Chat /> },
  { path: '/labels', label: 'Project Labels', icon: <Label /> },
  { path: '/settings', label: 'Settings', icon: <Settings /> },
]

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps): React.ReactElement {
  const navigate = useNavigate()
  const location = useLocation()
  const { userName, userEmail } = useAuthStore()

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          // Make the entire sidebar background draggable so the user can grab anywhere
          // in the sidebar to move the window. Interactive children set no-drag below.
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            WebkitAppRegion: 'drag',
          },
        }}
      >
        {/* App header / macOS traffic-light spacer */}
        <Box sx={{ p: 2.5, pt: window.electron.platform === 'darwin' ? 4 : 2.5 }}>
          <Typography variant="h6" fontWeight={700} color="primary.light" letterSpacing={1}>
            RECALL
          </Typography>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* Navigation — no-drag so clicks register normally */}
        <List sx={{ flex: 1, py: 1 }} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {navItems.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            return (
              <ListItem key={item.path} disablePadding>
                <ListItemButton
                  onClick={() => navigate(item.path)}
                  selected={active}
                  sx={{
                    mx: 1,
                    borderRadius: 1,
                    '&.Mui-selected': {
                      backgroundColor: 'rgba(255,255,255,0.12)',
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(255,255,255,0.08)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ color: active ? 'primary.light' : 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: 14,
                      fontWeight: active ? 600 : 400,
                      color: active ? 'primary.light' : 'rgba(255,255,255,0.8)',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            )
          })}
        </List>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        {/* User info — no-drag */}
        <Box
          sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
            {userName?.charAt(0) ?? userEmail?.charAt(0) ?? '?'}
          </Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="body2" color="rgba(255,255,255,0.9)" noWrap fontWeight={500} fontSize={13}>
              {userName ?? 'User'}
            </Typography>
            <Typography variant="caption" color="rgba(255,255,255,0.5)" noWrap fontSize={11}>
              {userEmail ?? ''}
            </Typography>
          </Box>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'background.default',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
