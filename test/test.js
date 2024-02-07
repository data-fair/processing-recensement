process.env.NODE_ENV = 'test'
const config = require('config')
const assert = require('assert').strict
const rencensementProcessing = require('../')

describe('test', function () {
  it('should expose a plugin config schema for super admins', async () => {
    const schema = require('../plugin-config-schema.json')
    assert.ok(schema)
  })

  it('should expose a processing config schema for users', async () => {
    const schema = require('../processing-config-schema.json')
    assert.equal(schema.type, 'object')
  })

  it('try', async function () {
    this.timeout(1000000)

    const testsUtils = await import('@data-fair/lib/processings/tests-utils.js')
    // Creation d'un dataset
    const context = testsUtils.context({
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
    // const context = testsUtils.context({
    //   pluginConfig: {
    //     apiAccessToken: config.apiAccessToken
    //   },
    //   processingConfig: {
    //     datasetMode: 'update',
    //     dataset: { title: 'Recensement Test', id: 'mc2gfytyerwt8o3cezg6tuj7' },
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
