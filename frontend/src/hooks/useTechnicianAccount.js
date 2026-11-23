import { useQuery } from '@tanstack/react-query';
import * as techniciansApi from '../api/technicians.api.js';
import { queryKeys } from '../lib/queryKeys.js';

/** { profile, user, receivesJobs, message } from GET /technicians/me. */
export function useTechnicianAccount() {
  return useQuery({
    queryKey: queryKeys.technicianMe,
    queryFn: techniciansApi.getMyTechnicianAccount,
    staleTime: 30_000,
  });
}
