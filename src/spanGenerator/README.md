# Span Generator

This function is solely for testing out this POC. Run with `node index.js` to continually generate and send long running spans to the lambda function `Push Traces`

It constructs fake long running spans by overriding start and end micros, then reports are submitted via a `lightstep-javascript-tracer` with an overridden transport (see `buffer_transport`).

To actually have a tracing client work with this POC, instead of overriding the transport type, `Push Traces` should be modified to accept all transports and data models, and tracing clients should be setting `Push Traces` exposed via an endpoint as the `collector_host` (see the `README.md` of `Push Traces` for more info)