import { createContext } from 'react';

/** The bridge's own WiFi signal; null when there is no bridge in the path. */
export const WifiRssiContext = createContext<number | null>(null);
