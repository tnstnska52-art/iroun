import type { OfficeState } from '@/lib/service';
export interface OfficeProps { o: OfficeState; refresh: () => Promise<unknown> }
