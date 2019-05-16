const request = require('request-promise');

// This is a hacky workaround. In this case I'm copying the data model
// from the tracer files (means that you have to maintain it separately
// instead of relying on the tracer library, bad!!!)
const crouton_thrift = require('./crouton-thrift');

// where r is report.runtime
const translateRuntimeToThrift = (r) => {
  let attrs = r.attrs.map((a) => {
    return new crouton_thrift.KeyValue({
      Key: a.Key,
      Value: a.Value
    });
  });

  return new crouton_thrift.Runtime({
    guid: r.guid,
    start_micros: r.start_micros,
    group_name: r.group_name,
    attrs,
  });
};

const translateSpanRecordToThrift = (s) => {
  let attributes = s.attributes.map((a) => {
    // Note: remember these key vals are strings rn because of dynamo
    // if they aren't all strings we'd have to make them all strings
    // anyway because thats what the thrift model expects
    return new crouton_thrift.KeyValue({
      Key   : a.Key,
      Value : a.Value,
    });
  });

  return new crouton_thrift.SpanRecord({
    span_guid       : s.span_guid,
    trace_guid      : s.trace_guid,
    runtime_guid    : s.runtime_guid,
    span_name       : s.span_name,
    oldest_micros   : s.oldest_micros,
    youngest_micros : s.youngest_micros,
    attributes      : attributes,
    error_flag      : s.error_flag,
    log_records     : [],
    // right now log_records are null
    // they'd have to be coerced to thrift too
    // if they weren't null
  });
};

const translateSpansToThrift = (spans) => {
  return spans.map(translateSpanRecordToThrift);
};

// r is a report in a request
const translateToThrift = (r) => {
  return new crouton_thrift.ReportRequest({
    runtime          : translateRuntimeToThrift(r.runtime),
    oldest_micros    : r.oldestMicros,
    youngest_micros  : r.youngestMicros,
    span_records     : translateSpansToThrift(r.span_records),
    internal_logs    : r.internal_logs,
    internal_metrics : r.internal_metrics,
    timestamp_offset_micros : r.timestamp_offset_micros,
    counters: r.counters,
  });
};

const submitReportManual = (req) => {
  let auth = req.auth;
  let detached = req.detached; // turns out this doesn't matter at all
  let report = translateToThrift(req.report);
  // For submitting to developer satellite when running locally
  // let url = 'http://localhost:9001/api/v0/reports';
  let url = 'http://collector-http.lightstep.com:80/api/v0/reports';
  return request.post(url, {
    headers: {
      'Content-Type': 'application/json',
      'LightStep-Access-Token': auth.access_token,
    },
    body: JSON.stringify(report),
  });
}

const submitReportToSatellites = (request) => {
  return submitReportManual(request);
}

module.exports = submitReportToSatellites;