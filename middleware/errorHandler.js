const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    logger.error({
        msg: err.message,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method,
        statusCode: err.statusCode,
    });

    if (process.env.NODE_ENV === 'development') {
        res.status(err.statusCode).json({
            status: err.status,
            error: err,
            message: err.message,
            stack: err.stack
        });
    } else {
        if (err.isOperational) {
            res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        } else {
            res.status(500).json({
                status: 'error',
                message: 'Something went very wrong!'
            });
        }
    }
};

module.exports = errorHandler;
