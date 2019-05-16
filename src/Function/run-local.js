const { handler } = require('./index.js');
const json = require('../../dynamo-insertion-event-example.json');

process.env['TABLE_NAME'] = 'poc-ls-dynamo-development-spanTable';
process.env['ACCESS_TOKEN'] = '425c9b9734e6cd039b41689aa83937cd';

async function run() {
  try {
    await handler(json);
  } catch (err) {
    console.log(err);
  }
} 

run();
