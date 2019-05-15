const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const flatMap = require('array.prototype.flatmap');
var dynamodb = new AWS.DynamoDB()

const FINISH_FLAG_KEY = 'finished_flag';
const FINISH_FLAG_VALUE = true;

const handleReport = async ({ requests }) => {
  let allSpanRecords = flatMap(requests, (request) => {
      return request.report.span_records;
    })
    .map(({ span_guid,
            trace_guid,
            runtime_guid,
            span_name,
            // join_ids, not supporting these here, but they would be an array,
            // unsure how the SaaS would handle them but likely would be fine
            oldest_micros,
            youngest_micros,
            attributes, // these are the tags
            error_flag,
            // log_records, ignoring logs right now but it would be an array
          }) => {
      // process spans and push individually, for performance can do this as a batch
      // and push up to 25 at a time into Dynamo

      // look for a flag in the tags, if this tag exists and is true
      // this is the last span in the trace
      let finished_flag = attributes.some((tag) => {
        return (tag.Key === FINISH_FLAG_KEY) && (tag.Value === FINISH_FLAG_VALUE);
      });

      // translate attributes to a map list for dynamo
      let translatedAttributes = attributes.map((attr) => {
        return {
          M: {
            Key: { S: attr.Key },
            Value: { S: `${attr.Value}` }
            // warning, not maintaining types in the tags here,
            // would need to add more metadata to get around that
            // also need to validate how this looks with different tags i.e. a tag that is a full object, a tag that is a number
          }
        }
      });

      // ideally store all this stuff separately except for span_guid, trace_guid and the finished flag
      // was thinking something like s3 for storing span batches, but that gets complicated ;)
      let params = {
        TableName: process.env.TABLE_NAME,
        Item: {
          span_guid: { S: span_guid },
          trace_guid: { S: trace_guid },
          runtime_guid: { S: runtime_guid },
          span_name: { S: span_name },
          oldest_micros: { N: `${oldest_micros}` }, // dynamo likes numbers saved as strings
          youngest_micros: { N: `${youngest_micros}` }, // dynamo likes numbers saved as strings
          attributes: { L: translatedAttributes },
          error_flag: { BOOL: error_flag },
          finished_flag: { BOOL: finished_flag }
        }
      }
      console.log('Attempting to put a span record in dynamo.');
      return dynamodb.putItem(params).promise();
    });
  return await Promise.all(allSpanRecords);
}

exports.handler = async message => {
  let report;
  try {
    report = JSON.parse(message);
  } catch (err) {
    return new Error(`Invalid JSON for report: ${err}`);
  }

  if (!report.requests) {
    return;
  }

  try {
    console.log('Handling report.');
    await handleReport(report);
    console.log('Wrote to dynamo, done.');
  } catch (err) {
    console.log(err);
    return new Error(`Handling report failed: ${err}`);
  }

  return {};
}
