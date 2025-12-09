import type { Context } from 'hono';

export const faviconHandler = (c: Context) => {
  const path = c.req.path.toLowerCase();
  
  if (path.endsWith('.svg')) {
    return c.redirect('/static/favicon.svg');
  }

  return c.redirect('/static/favicon.ico');
};