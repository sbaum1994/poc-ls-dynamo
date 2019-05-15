var fs           = require("fs");
var deepClone    = require("clone");
var _            = require("underscore");

// Make sure the creds are correct!
const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const FUNCTION_NAME = 'poc-ls-dynamo-development-pushTraces'

function BufferTransport() {
  this._requests = [];
}

// Buffer and send to lambda function
BufferTransport.prototype.invoke = (payloadObject) => {
  let params = {
    FunctionName: FUNCTION_NAME,
    Payload: JSON.stringify(payloadObject),
  };

  let lambda = new AWS.Lambda();

  return new Promise((resolve, reject) => { 
    lambda.invoke(params, function(err, response) {
      if (err) {
        reject(err);
      } else {
        // debugging
        // console.error(response);
        resolve(response);
      }
    });
  });
}

BufferTransport.prototype.ensureConnection = function() {
  // No op
};

BufferTransport.prototype.report = function(detached, auth, report, done) {
  report = deepClone(report);

  // Not stripping null fields but might have to at some point
  // (it could be an optimization, need to investigate if it will 
  // break anything upstream)
  this._requests.push({
    detached : detached,
    auth : auth.toThrift(),
    report : report.toThrift(),
  });

  // Send to lambda function here

  // Debugging
  console.log(JSON.stringify({
    requests: this._requests,
  }));

  this.invoke({ requests: this._requests })
    .then((resp) => {
      done(null, resp);
    })
    .catch((err) => {
      done(err, null);
    });
};

BufferTransport.prototype.readReports = function() {
  return this._requests;
};

module.exports = BufferTransport;