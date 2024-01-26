process.env.NODE_ENV = 'test'
const config = require('config')
const testUtils = require('@data-fair/processings-test-utils')
const rencensementProcessing = require('../')

describe('test', function () {
  it('try', async function () {
    this.timeout(1000000)

    // Creation d'un dataset
    // const context = testUtils.context({
    //   pluginConfig: {
    //     apiAccessToken: config.apiAccessToken
    //   },
    //   processingConfig: {
    //     datasetMode: 'create',
    //     dataset: { title: 'Recensement Test' },
    //     filter: {
    //       codeType: 'code_departement',
    //       code: '973'
    //     },
    //     years: '2006',
    //     clearFile: true
    //   },
    //   tmpDir: 'data'
    // }, config, false)

    // Mise à jour du dataset
    const context = testUtils.context({
      pluginConfig: {
        apiAccessToken: config.apiAccessToken
      },
      processingConfig: {
        datasetMode: 'update',
        dataset: { title: 'Recensement Test', id: 're7rgz7bg-s9y5pqu12jself' },
        filter: {
          codeType: 'code_departement',
          code: '974'
        },
        clearFile: false
      },
      tmpDir: 'data'
    }, config, false)

    await rencensementProcessing.run(context)
  })
})
