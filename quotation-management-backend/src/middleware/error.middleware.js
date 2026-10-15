const ApiError = require("../utils/ApiError");

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode;
  error.errors = err.errors;

  if (err.name === "SequelizeUniqueConstraintError") {
    const field = err.errors?.[0]?.path || "value";
    error = new ApiError(400, `${field} already exists`);
  }
  if (err.name === "SequelizeValidationError") {
    error = new ApiError(400, err.errors.map((e) => e.message).join(", "));
  }
  if (err.name === "SequelizeForeignKeyConstraintError") {
    error = new ApiError(400, "Invalid reference: related record does not exist");
  }
  if (err.name === "JsonWebTokenError") error = new ApiError(401, "Invalid token");
  if (err.name === "TokenExpiredError") error = new ApiError(401, "Token expired");
  if (err.name === "MulterError") error = new ApiError(400, err.message);

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || "Internal Server Error",
    ...(Array.isArray(error.errors) && error.errors.length && { errors: error.errors }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
