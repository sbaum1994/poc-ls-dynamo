# POC: long running traces using a dynamodb buffer and AWS Lambda

See individual function folders for write ups on each function.

The overall flow is:

App Tracing Client --> AWS Lambda `pushTraces` --> DynamoDB `spanTable` --> AWS Lambda `listener` --> LightStep Satellites --> LightStep SaaS

The biggest limiter to long running traces in LightStep is Satellite recall. This POC gets around this limitation by buffering spans in DynamoDB (a performant transactional nosql database), listening to the database via emitted events, and pulling and submitting all spans associated to a trace when it detects the trace is finished via a `finished_flag: true` span tag on the longest running/final span of the long running transaction.

In the product, this still enables all features except the Latency Histogram in Explorer (since that histgoram is displaying logarithmically and assuming that all spans will be of a shorter duration). One caveat, traces with an extremely high amount of spans may not look nice in the Trace View page. Until this is mitigated in some way in the product, a work around could be achieved by creating lower fidelity traces in some way (i.e. having a verbosity flag, purposeful exclusion in the listener, etc.)

This POC was made with https://www.stackery.io/ as the deployment manager and CloudFormation template generator.
