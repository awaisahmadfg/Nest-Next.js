import { useBreadcrumbStore } from '@/app/store/breadcrumbStore';

export const useBreadcrumb = () => {
  const { breadcrumbs, setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbStore();

  return {
    breadcrumbs,
    setBreadcrumbs,
    clearBreadcrumbs,
  };
};
