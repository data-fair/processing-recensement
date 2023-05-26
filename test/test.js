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
        filter: '51',
        year: '2018-2007-2019',
        datasetRP: 'GEO2022RP2019-GEO2021RP2018',
        datasetMode: 'create',
        dataset: { title: 'recensement 51' },
        apiAccessToken: 'token Insee : https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/application.jag?name=DefaultApplication',
        clearFile: false
      },
      tmpDir: 'data'
    }, config, false)
    await rencensement.run(context)
  })
})
