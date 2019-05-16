# Span Listener

This function acts as a listener to the streaming DynamoDB events and only takes action when the `spanTable` emits a triggering event, otherwise it returns.

The algorithm is as follows:
1. Listen to events:
  - if the event is an insert event, and `span_record` tags include `finished_flag` set to `true` trigger processEvent
2. Process a single event:
  - extract `trace_guid` from event and query all spans from dynamo matching this `trace_guid`
  - translate each span back to a LightStep span object
  - translate spans and metadata to a LightStep report object
  - submit all spans making up this trace in a LightStep report
3. Submit report:
  - convert to crouton-thrift JSON Thrift format that LightStep accepts
  - submit to public satellties/customer satellite pool/local developer satellite as one report

See the "dynamo-insertion-event-example.json" for an example of the expected incoming object.

In this POC implementation, reports are coerced to crouton-thrift report format (stolen from the `lightstep-javascript-tracer`). In a production environment and at scale, for better performance, this function should coerce the report format to the expected LightStep report protobuf format and submit to satellites as HTTP Proto.

Run locally with mock data with `run-local.js`