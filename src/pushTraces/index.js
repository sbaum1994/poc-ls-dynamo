
const flatMap = require('array.prototype.flatmap');

/*  Assuming permissions are properly configured for this lambda,
    this is the only configuration that would be needed */
const AWS = require('aws-sdk');
/* Recommendation: use process.env.AWS_REGION */
AWS.config.update({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB()

const FINISH_FLAG_KEY = 'finished_flag';
const FINISH_FLAG_VALUE = 'true';

const mapSpanToDynamoRecord = (r, serviceName) => {
  // r.join_ids, not supporting these here, but they would be an array,
  // unsure how the SaaS would handle them but likely would be fine
  // r.log_records, ignoring logs right now but it would be a string array
  // or array list

  // Attributes refer to the span tags

  // look for a flag in the tags of the span,
  // if this tag exists and is true,
  // then this is the last span in the trace
  let finished_flag = r.attributes.some((tag) => {
    return (tag.Key === FINISH_FLAG_KEY) && (tag.Value === FINISH_FLAG_VALUE);
  });

  // Translates attributes to a map list for dynamo
  // Attributes refer to the span tags.
  let translatedAttributes = r.attributes.map((attr) => {
    return {
      M: {
        Key: { S: attr.Key },
        Value: { S: `${attr.Value}` }
        /* 
          Warning, not maintaining types in the tags here,
          would need to add more metadata or handling
          to get around this so that tags are submitted with the proper
          typing independent of the language of the tracer reporting.

          Example of types to handle -
            a tag that is a full object,
            a tag that is a number,
            a tag that is a 
            
          Similar thing would need to be done for log handling
        */
      }
    }
  });

  /*
    Maybe consider storing all this span stuff separately except for
    span_guid, trace_guid and the finished_flag. There's also some data that 
    can be condensed.

    This would be so that DynamoDB is purely transactional and not holding as much.
  
    Was thinking something like S3 for storing span batches, but that gets complicated
    since you then have to maintain a mapping of the report/span batch.
  
    Could also use AWS.DynamoDB.Converter.marshall to do this conversion but I prefer manual
    since I don't know how that function will marshall certain things, and whether
    it will marshall values to what I expect.
  */
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
    return spanRecords.sort((a, b) => {
        return a.youngest_micros - b.youngest_micros;
      }).map((r) => {
      /*  
          Process spans and push individually,
          for performance can do this as a batch
          and push up to 25 at a time into DynamoDB
          just make sure that the batch event is handled
          correctly on the other end by the listener function
      */
      let params = mapSpanToDynamoRecord(r, serviceNameFromRuntime);

      console.log('Attempting to put a span record in dynamo.');
      return dynamodb.putItem(params).promise();
    });
  });
  return await Promise.all(allSpanRecords);
}

exports.handler = async message => {
  let report = message;

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
