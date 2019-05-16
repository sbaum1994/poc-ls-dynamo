const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const flatMap = require('array.prototype.flatmap');
let dynamodb = new AWS.DynamoDB()

const FINISH_FLAG_KEY = 'finished_flag';
const FINISH_FLAG_VALUE = true;

const mapSpanToDynamoRecord = (r, serviceName) => {
  // r.join_ids, not supporting these here, but they would be an array,
  // unsure how the SaaS would handle them but likely would be fine
  // r.log_records, ignoring logs right now but it would be an array

  // attributes are the tags
  // look for a flag in the tags, if this tag exists and is true
  // this is the last span in the trace
  let finished_flag = r.attributes.some((tag) => {
    return (tag.Key === FINISH_FLAG_KEY) && (tag.Value === FINISH_FLAG_VALUE);
  });

  // translate attributes to a map list for dynamo
  let translatedAttributes = r.attributes.map((attr) => {
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

  // maybe store all this stuff separately except for span_guid, trace_guid and the finished flag
  // was thinking something like s3 for storing span batches, but that gets complicated ;)
  
  // could also use AWS.DynamoDB.Converter.marshall to do this but I prefer manual
  // since I don't know how that function will marshall certain things, and whether
  // it will marshall to what I expect.
  let params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      span_guid: { S: r.span_guid },
      trace_guid: { S: r.trace_guid },
      runtime_guid: { S: r.runtime_guid },
      span_name: { S: r.span_name },
      oldest_micros: { N: `${r.oldest_micros}` }, // dynamo likes numbers saved as strings
      youngest_micros: { N: `${r.youngest_micros}` }, // dynamo likes numbers saved as strings
      attributes: { L: translatedAttributes },
      error_flag: { BOOL: r.error_flag },
      service_from_runtime: { S: serviceName },
      finished_flag: { BOOL: finished_flag },
    }
  }
  return params;
}

const handleReport = async ({ requests }) => {
  let allSpanRecords = flatMap(requests, (request) => {
    let spanRecords = request.report.span_records;
    let serviceNameFromRuntime = request.report.runtime.group_name;
    return spanRecords.map((r) => {
      // process spans and push individually, for performance can do this as a batch
      // and push up to 25 at a time into Dynamo

      let params = mapSpanToDynamoRecord(r, serviceNameFromRuntime);

      console.log('Attempting to put a span record in dynamo.');
      return dynamodb.putItem(params).promise();
    });
  });
  return await Promise.all(allSpanRecords);
}

exports.handler = async message => {
  console.log(message);
  let report = message;
  // try {
  //   report = JSON.parse(message);
  // } catch (err) {
  //   throw new Error(`Invalid JSON for report: ${err}`);
  // }

  if (!report.requests) {
    return;
  }

  try {
    console.log('Handling report.');
    await handleReport(report);
    console.log('Wrote to dynamo, done.');
  } catch (err) {
    console.log(err);
    throw new Error(`Handling report failed: ${err}`);
  }

  return {};
}
