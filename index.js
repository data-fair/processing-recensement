const path = require('path')
const fs = require('fs-extra')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const process = require('./lib/process')

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
}
