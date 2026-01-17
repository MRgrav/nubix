export const sendSuccess = (res, status, data, message = null, meta = null) => {
  const response = {};
  if (message) response.message = message;
  response.data = data;
  if (meta) response.meta = meta;
  res.status(status).json(response);
};

export const sendError = (res, status, error, code, details = null) => {
  const response = { error, code };
  if (details) response.details = details;
  res.status(status).json(response);
};
