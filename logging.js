'use strict';
const winston = require('winston');

module.exports.getLogger = function(name, level) {
  return new winston.Logger({transports: [
    new winston.transports.Console({
      level: level || 'info',
      colorize: true,
      label: name || null
    })
  ]});
};
