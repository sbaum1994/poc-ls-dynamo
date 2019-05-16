const { DateTime, Duration } = require('luxon');
const lightstep = require('lightstep-tracer');
const BufferTransport = require('./buffer_transport');

// Run this locally to generate some fake long running spans

// Note: for some reason these don't assembly correclty in the UI unless you clik
// on the root span in Explorer (i.e. child spans will cause an assembly failure)
// probably because the timestamps are spoofed.

const tracer = new lightstep.Tracer({
  component_name   : 'longrunning',
  access_token     : '425c9b9734e6cd039b41689aa83937cd',
  verbosity        : 4,
  override_transport : new BufferTransport()
});

const generateChild = (a, b, dur, parent, nm) => {
  let offset = Duration.fromMillis(dur.as('milliseconds')*0.10) // insert randomness here
  let na = a.plus(offset);
  let nb = b.minus(offset);

  // let nspan = tracer.startSpan('op2', { parent : parent.context() });
  let nspan = tracer.startSpan(nm, { startTime: na.toMillis(), childOf : parent.context() });
  nspan.finish(nb.toMillis());
  return {
    a: na,
    b: nb,
    dur: nb.diff(na),
    span: nspan
  };
}

const addMult = (t, duration, x) => {
  let nt = t;
  for (let i = 0; i < x; i=i+1) {
    nt = nt.plus(duration);
  }
  return nt;
}

const generateChildren = (a, b, dur, sp, num) => {
  let step = Duration.fromMillis((dur.as('milliseconds'))/num);
  let ret = [];
  let i = 0;
  for (i; i < num; i=i+1) {
    let na = addMult(a, step, i);
    let nb = addMult(a, step, i+1);
    ret.push(generateChild(na, nb, step, sp, 'child' + i));
  }
  return ret;
}

const generateRoot = (dur) => {
  let b = DateTime.local();
  let a = b.minus(dur);
  console.log(`Generating spans starting at ${a.toISO()} and ending at ${b.toISO()}`);

  let root = tracer.startSpan('op', { startTime: a.toMillis() });
  let child = generateChild(a, b, dur, root, 'child');
  let children = generateChildren(child.a, child.b, child.dur, child.span, 3);
  // need to click on root in the ui to trigger the trace to assemble properly
  root.setTag('finished_flag', true);
  root.finish(b.toMillis());
}

const duration = Duration.fromObject({ minutes: 60 });
generateRoot(duration);