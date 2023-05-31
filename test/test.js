process.env.NODE_ENV = 'test'
const config = require('config')
const testUtils = require('@data-fair/processings-test-utils')
const rencensement = require('../')

describe('test', function () {
  it('try', async function () {
    this.timeout(100000000000)
    const context = testUtils.context({
      pluginConfig: {
      },
      processingConfig: {
        filter: '49',
        // year: '',
        // datasetRP: '',
        datasetMode: 'create',
        dataset: { title: 'recensement 51' },
        apiAccessToken: '56318f74-0610-37da-850c-3c501c9ffba5',
        clearFile: false
      },
      tmpDir: 'data'
    }, config, false)
    await rencensement.run(context)
  })
})
