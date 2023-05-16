const path = require('path')
const fs = require('fs-extra')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const process = require('./lib/process')
const upload = require('./lib/upload')

exports.run = async ({ pluginConfig, processingConfig, tmpDir, axios, log, patchConfig }) => {
  await fs.ensureDirSync(path.join(tmpDir))
  if (!fs.existsSync(path.join(tmpDir, 'token.json'))) {
    await fs.ensureFileSync(path.join(tmpDir, 'token.json'))
    await fs.writeFileSync(path.join(tmpDir, 'token.json'), JSON.stringify({}))
  }
  await log.info('Récupération du token')
  const file = await fs.readFileSync(path.join(tmpDir, 'token.json'))
  let token = await JSON.parse(file)
  if (!token.access_token || token.expiration < Date.now()) {
    token = { data: {} }
    const key = Buffer.from(`${processingConfig.apiKey}:`).toString('base64')
    await log.info('Token expiré ou inexistant, récupération d\'un nouveau token')
    while (!token.data.access_token) {
      token = await axios({
        method: 'post',
        url: 'https://api.insee.fr/token',
        data: 'grant_type=client_credentials',
        headers: { Authorization: 'Basic ' + key }
      }).catch((err) => {
        log.info('Erreur lors de la récupération du token, réessai dans 2 secondes')
        log.info(JSON.stringify(err, null, 2))
      })
      await wait(2000)
    }
    token.data.expiration = Date.now() + token.data.expires_in * 1000
    await fs.writeFileSync(path.join(tmpDir, 'token.json'), JSON.stringify(token.data, null, 2))
    token = token.data
  }
  await process(processingConfig, axios, tmpDir, log, token)
  if (processingConfig.datasetMode === 'update' && !processingConfig.forceUpdate) {
    try {
      await log.step('Vérification de l\'en-tête du jeu de données')
      const schemaActuelDataset = (await axios.get(`api/v1/datasets/${processingConfig.dataset.id}/schema`, { params: { calculated: false } })).data.map((elem) => `"${elem.key}"`).join(',').replace(/['"]+/g, '')

      let files = await fs.readdir(tmpDir)
      files = files.filter(file => file.endsWith('.csv'))
      const file = files[0] && path.join(tmpDir, files[0])
      const headFile = fs.createReadStream(file, { encoding: 'utf8' })
      let head

      await new Promise((resolve) => {
        headFile.once('data', (chunk) => {
          head = chunk.slice(0, chunk.indexOf('\n'))
          resolve()
        })
      })

      if (!head.includes(schemaActuelDataset.slice(0, head.length - 1))) {
        await log.info('Le jeu de données ne possède pas la même en-tête que le fichier téléchargé. Activez la mise à jour forcée pour mettre à jour')
        throw new Error('En-têtes différentes entre les fichiers')
      } else {
        await log.info('En-têtes identiques, mise à jour')
      }
    } catch (err) {
      await log.info(err)
      throw err
    }
  }

  await upload(processingConfig, tmpDir, axios, log, patchConfig)

  if (processingConfig.clearFiles) {
    await fs.emptyDir(tmpDir)
  }
}
