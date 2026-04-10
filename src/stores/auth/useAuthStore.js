// stores/auth/login
import { create } from 'zustand';

const useAuthStore = create((set) => ({
    isLoggedIn: false,
    user: null,
    login: (userData) => set({ isLoggedIn: true, user: userData }),
    logout: () => set({ isLoggedIn: false, user: null }),
    updateUser: (partial) => set((state) => ({
        user: state.user ? { ...state.user, ...partial } : partial,
    })),
}));

export default useAuthStore;
