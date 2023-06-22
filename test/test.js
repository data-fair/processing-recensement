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
        // filter: '49',
        year: '2019-2016',
        datasetMode: 'create',
        dataset: { title: 'recensement 2019' },
        apiAccessToken: '5d461306-56f8-3781-ae71-6fa99cfb6fcf',
        clearFile: false
      },
      tmpDir: 'data'
    }, config, false)
    await rencensement.run(context)
  })
})
