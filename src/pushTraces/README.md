# Push Traces

This function acts as a proxy layer by ingesting span reports in JSON format and writing them to DynamoDB using trace_guid as the primary index and span_guid as the range tag.

These indicies enable performant queries on the listener when all spans matching a trace_guid must be pulled and forwarded to LightStep.

See the "thrift-representation-example.json" for an example of the expected object.

In this POC implementation the reports are submitted via a javascript-tracer with an overridden transport (see `spanGenerator`).

In a production environment and at scale, this function would need to accept HTTP Proto, GRPC and HTTP Thrift JSON traffic and their corresponding report datamodels to support all tracer clients. To save some money, I'd also implement an item expiration in Dynamo for all spans submitted (i.e. DynamoDB Time-to-Live). Lambda functions are cheap to run at scale, but DynamoDB storing buffered traces forever will not be cheap ;) 

To expose this function via an endpoint, consider creating an API Gateway Proxy to the function in AWS.

Run locally with mock data with `run-local.js`