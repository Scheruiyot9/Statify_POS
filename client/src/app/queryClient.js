import { QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          1000 * 60 * 2,   // 2 minutes
      retry:              1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (err) => {
        const msg = err?.response?.data?.message || 'Something went wrong';
        toast.error(msg);
      },
    },
  },
});
