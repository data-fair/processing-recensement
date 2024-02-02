process.env.NODE_ENV = 'test'
const config = require('config')
const testUtils = require('@data-fair/processings-test-utils')
const rencensementProcessing = require('../')

describe('test', function () {
  it('try', async function () {
    this.timeout(1000000)

    // Creation d'un dataset
    const context = testUtils.context({
      pluginConfig: {
        apiAccessToken: config.apiAccessToken
      },
      processingConfig: {
        datasetMode: 'create',
        dataset: { title: 'Recensement Test' },
        codeType: 'code_departement',
        code: '974',
        years: [2006],
        clearFile: true
      },
      tmpDir: 'data'
    }, config, false)

    // Mise à jour du dataset
    // const context = testUtils.context({
    //   pluginConfig: {
    //     apiAccessToken: config.apiAccessToken
    //   },
    //   processingConfig: {
    //     datasetMode: 'update',
    //     dataset: { title: 'Recensement Test', id: 'xk6bmhg847-pf9hgcmtyk3ri' },
    //     codeType: 'code_departement',
    //     code: '974',
    //     years: [2006],
    //     clearFile: false
    //   },
    //   tmpDir: 'data'
    // }, config, false)

    await rencensementProcessing.run(context)
  })
})
