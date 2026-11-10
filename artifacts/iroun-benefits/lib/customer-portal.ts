// Contract customers use the same CRM session and records on every surface.
// Never append app tokens, phone numbers, or customer IDs to this URL.
export const CUSTOMER_PORTAL_URL = 'https://go.irowoon.com/package-conditions';

export type PortalResult = 'opened' | 'closed' | 'busy';
type BrowserResult = { type: string };
type PortalNavigation = {
  platform: string;
  openInApp: (url: string) => Promise<BrowserResult>;
  openExternal: (url: string) => Promise<unknown>;
  openWeb: (url: string) => void;
};

/** Opening the portal never submits a request or marks a reply as read. */
export function createCustomerPortalLauncher(navigation: PortalNavigation) {
  let pending = false;
  return async (external = false): Promise<PortalResult> => {
    if (pending) return 'busy';
    pending = true;
    try {
      if (navigation.platform === 'web') {
        // Keep web navigation in this tab: no blocked popup or duplicate login window.
        navigation.openWeb(CUSTOMER_PORTAL_URL);
        return 'opened';
      }
      if (external) {
        await navigation.openExternal(CUSTOMER_PORTAL_URL);
        return 'opened';
      }
      const result = await navigation.openInApp(CUSTOMER_PORTAL_URL);
      if (result.type === 'cancel' || result.type === 'dismiss') return 'closed';
      if (result.type !== 'opened') throw new Error('Customer portal could not be opened');
      return 'opened';
    } finally {
      pending = false;
    }
  };
}
