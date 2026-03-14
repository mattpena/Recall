import { create } from 'zustand'
import type { AuthStatus } from '../../shared/types'

interface AuthStore extends AuthStatus {
  setAuthStatus: (status: AuthStatus) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  isSignedIn: false,
  userEmail: null,
  userName: null,
  setAuthStatus: (status) => set(status),
}))
