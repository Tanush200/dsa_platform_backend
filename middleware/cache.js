/**
 * Cache middleware to set Cache-Control headers.
 * @param {number} seconds - Number of seconds to cache the response.
 * @param {boolean} isPrivate - If true, sets cache to 'private' (user-specific).
 */
const setCache = (seconds, isPrivate = false) => {
  return (req, res, next) => {
    if (req.method === 'GET') {
      const cacheType = isPrivate ? 'private' : 'public';
      res.set('Cache-Control', `${cacheType}, max-age=${seconds}`);
    } else {
      res.set('Cache-Control', 'no-store');
    }
    next();
  };
};


const noCache = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};

module.exports = { setCache, noCache };
