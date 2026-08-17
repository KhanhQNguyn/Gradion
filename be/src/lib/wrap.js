// Express 4 doesn't forward rejected promises to error middleware on its own.
export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
