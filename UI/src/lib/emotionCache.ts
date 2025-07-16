// lib/emotionCache.ts
// 'use client';
// import createCache from '@emotion/cache';
// import rtlPlugin from 'stylis-plugin-rtl';
// import { prefixer } from 'stylis';
// export const emotionCacheRtl = createCache({
//   key: 'css-rtl',
//   stylisPlugins: [prefixer, rtlPlugin],
// });

// lib/emotionCache.ts
'use client';
import createCache from '@emotion/cache';

export const emotionCache = createCache({
  key: 'css',        // אם תרצה תוכל לשנות את ה-key חזרה ל-'css'
  // אין כאן stylisPlugins → לא מבצעים RTL אוטומטי
});
