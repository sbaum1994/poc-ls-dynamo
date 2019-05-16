const AWS = require('aws-sdk');
AWS.config.update({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB()
const FINISHED_FLAG_KEY = 'finished_flag';
const submitReportToSatellites = require('./submit-report');

const isFinishedEvent = (e) => {
  return e.dynamodb && e.dynamodb.NewImage && e.dynamodb.NewImage[FINISHED_FLAG_KEY] && e.dynamodb.NewImage[FINISHED_FLAG_KEY].BOOL;
}

const isValidEvent = (e) => {
  let valid = e.dynamodb.Keys.span_guid && e.dynamodb.Keys.trace_guid;
  if (!valid) {
    console.log('Events returned but were not valid, need primary and secondary indices set to span_guid and trace_guid.');
  }
  return valid;
}

const constructParams = (trace_guid) => {
  return {
    TableName: process.env.TABLE_NAME,
    KeyConditionExpression: `trace_guid = :trace_guid`,
    ExpressionAttributeValues: {
      ':trace_guid': { S: trace_guid },
    },
    ConsistentRead: false
  };
}

// https://stackoverflow.com/questions/14446511/most-efficient-method-to-groupby-on-a-array-of-objects
const groupByTraceGuid = function(xs) {
  return xs.reduce(function(rv, x) {
    (rv[x.dynamodb.Keys.trace_guid.S] = rv[x.dynamodb.Keys.trace_guid.S] || []).push(x);
    return rv;
  }, {});
};

const querySpans = (trace_guid) => {
  return dynamodb.query(constructParams(trace_guid)).promise()
    .then((res) => {
      console.log(`Pulled ${res.Count} span records for trace_guid: ${trace_guid}`)
      return res;
    });
}

const translateAttributes = (attr) => {
  return attr.map((a) => {
    let mp = a.M;
    return {
      Key: mp.Key.S,
      Value: mp.Value.S // Warning assumes all tag values are strings!!
    }
  });
}

const getServiceName = (s) => {
  return s.service_from_runtime.S;
}

// translate back to lightstep span record from dynamo
const translateToLightStepSpan = (s) => {
  return {
    span_guid: s.span_guid.S,
    trace_guid: s.trace_guid.S,
    span_name: s.span_name.S,
    oldest_micros: parseInt(s.oldest_micros.N),
    youngest_micros: parseInt(s.youngest_micros.N),
    attributes: translateAttributes(s.attributes.L),
    error_flag: s.error_flag.BOOL,
    runtime_guid: s.runtime_guid.S,
    log_records: [],
    join_ids: []
  };
}

const getMicros = (spans) => {
  let youngest = spans.map((s) => s.youngest_micros);
  let oldest = spans.map((s) => s.oldest_micros);
  let allMicros = youngest.concat(oldest);
  return {
    oldest_micros: Math.min.apply(Math, allMicros),
    youngest_micros: Math.max.apply(Math, allMicros)
  };
}

const generateReport = (spans, serviceName) => {
  /*  Note: Not handling original runtime at all
      this means that all the spans being submitted don't have a tracer
      platform defined, they just look like they're coming from this
      lambda function. Needs some thought to solve. */

  // Note: Explorer shows spans based on arrival time from the satellite buffer not start/finish time/oldest/youngest
  let { youngest_micros, oldest_micros } = getMicros(spans);

  console.log(`Settings youngest_micros to: ${youngest_micros} and oldest_micros to ${oldest_micros}`);

  let detached = true;
  let auth = {
    access_token: process.env.ACCESS_TOKEN
  };

  // Note: The below runtime attributes MUST be set or the satellite will reject the spans
  let runtime = {
    guid: spans[0].runtime_guid,
    start_micros: youngest_micros,
    group_name: serviceName,
    attrs: [ // fake data
      {
        Key: 'lightstep.tracer_version',
        Value: '0.21.1'
      },
      {
        Key: 'lightstep.tracer_platform',
        Value: 'node'
      },
      {
        Key: 'lightstep.tracer_platform_version',
        Value: 'v8.11.3'
      }
    ]
  };

  // Standard report object format before its converted to JSON Thrift
  return Promise.resolve(
    {
      detached,
      auth,
      report: {
        runtime,
        span_records: spans,
        log_records: [],
        timestamp_offset_micros: 0,
        oldest_micros,
        youngest_micros,
        counters: [],
        internal_logs: [],
        internal_metrics: {
          counts: [],
          gauges: []
        }
      }
    }
  );
};

const processEvents = async (events) => {
  let eventsGroupedByTraceGuid = groupByTraceGuid(events);
  return await Promise.all(
    // the chunks of work here are by trace guid
    Object.keys(eventsGroupedByTraceGuid).map((traceGuid) => {
      // for each trace guid query all span records under it and process
      // Note: might need to send batch reports here if there's too many spans
      return querySpans(traceGuid)
        .then(res => {
          let spans = res.Items.map(translateToLightStepSpan);
          let serviceName = getServiceName(res.Items[0]);
          return { spans, serviceName };
        })
        .then(({ spans, serviceName }) => {
          return generateReport(spans, serviceName);
        })
        .then((report) => submitReportToSatellites(report));
    })
  );
}

exports.handler = async (event, context) => {
  let eventsToProcess;

  try {
    let parsed = event; // JSON.parse(event), turns out the event is already parsed when it comes in
    eventsToProcess = [];
    if (parsed.Records) {
      eventsToProcess = parsed.Records.filter((rec) => {
        return rec.eventName === 'INSERT' && isFinishedEvent(rec) && isValidEvent(rec);
      });
    }
  } catch (err) {
    return new Error(`Invalid JSON or event extraction for event: ${err}`);
  }

  try {
    console.log(`Processing ${eventsToProcess.length} event(s)`);
    let spanRecords = await processEvents(eventsToProcess);
    // console.log(spans);
    console.log('Events processed.');
  } catch (err) {
    console.log(err);
    return new Error(`Events failed to process: ${err}`);
  }
  // Log the event argument for debugging and for use in local development.
  // console.log(JSON.stringify(event, undefined, 2));
  
  return {};
};
