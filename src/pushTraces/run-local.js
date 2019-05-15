const { handler } = require('./index.js');
const json = require('../../thrift-representation-example.json');

process.env['TABLE_NAME'] = 'poc-ls-dynamo-development-traceTable'
async function run() {
  try {
    await handler(JSON.stringify(json));
  } catch (err) {
    console.log(err);
  }
} 

run();
