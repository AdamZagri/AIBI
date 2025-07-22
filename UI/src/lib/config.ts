export const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'https://aibi.cloudline.co.il';

// Derive WS base URL automatically if not provided explicitly
export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ||
  (SERVER_BASE_URL.startsWith('https')
    ? SERVER_BASE_URL.replace(/^https:/, 'wss:')
    : SERVER_BASE_URL.replace(/^http:/, 'ws:')); 