import { create } from 'zustand';

export interface BreadcrumbItem {
  label: string;
  path?: string;
  isLast?: boolean;
}

interface BreadcrumbStore {
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (breadcrumbs: BreadcrumbItem[]) => void;
  clearBreadcrumbs: () => void;
  currentView: 'list' | 'create';
  setCurrentView: (view: 'list' | 'create') => void;
  resetToDefaultView: () => void;
}

export const useBreadcrumbStore = create<BreadcrumbStore>((set) => ({
  breadcrumbs: [],
  currentView: 'list',
  // Actions
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
  clearBreadcrumbs: () => set({ breadcrumbs: [] }),
  setCurrentView: (view) => set({ currentView: view }),
  resetToDefaultView: () => set({ currentView: 'list', breadcrumbs: [] }),
}));
