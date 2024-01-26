const path = require('path')
const fs = require('fs-extra')
const process = require('./lib/process')
const upload = require('./lib/upload')

exports.run = async ({ pluginConfig, processingConfig, processingId, tmpDir, axios, log, patchConfig }) => {
  await process(pluginConfig.apiAccessToken, processingConfig, axios, tmpDir, log)

  if (fs.existsSync(path.join(tmpDir, 'recensement.csv'))) {
    await upload(processingConfig, processingId, tmpDir, axios, log, patchConfig)
  } else {
    await log.error('Aucun fichier à uploader')
  }

  if (processingConfig.clearFiles) {
    await fs.emptyDir(tmpDir)
  }
}
