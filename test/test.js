process.env.NODE_ENV = 'test'
const config = require('config')
const testUtils = require('@data-fair/processings-test-utils')
const rencensement = require('../')

describe('test', function () {
  it('try', async function () {
    this.timeout(10000000)
    const context = testUtils.context({
      pluginConfig: {
      },
      processingConfig: {
        filter: '56',
        apiKey: config.inseeAPIKey

      },
      tmpDir: 'data'
    }, config, false)
    await rencensement.run(context)
  })
})
