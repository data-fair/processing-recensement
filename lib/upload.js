const datasetBase = require('./dataset-base')
const { Transform } = require('stream')
const fs = require('fs-extra')
const path = require('path')
const util = require('util')
const pump = util.promisify(require('pump'))
const csv = require('csv')

module.exports = async (processingConfig, processingId, dir, axios, log, patchConfig) => {
  await log.step('Upload des données')

  let dataset
  if (processingConfig.datasetMode === 'create') {
    await log.info('Création du jeu de données')
    dataset = (await axios.post('api/v1/datasets', {
      ...datasetBase,
      id: processingConfig.dataset.id,
      title: processingConfig.dataset.title,
      extras: { processingId }
    })).data
    await log.info(`jeu de donnée créé, id="${dataset.id}", title="${dataset.title}"`)
    await patchConfig({ datasetMode: 'update', dataset: { id: dataset.id, title: dataset.title } })
  } else if (processingConfig.datasetMode === 'update') {
    await log.info('Vérification du jeu de données')
    dataset = (await axios.get(`api/v1/datasets/${processingConfig.dataset.id}`)).data
    if (!dataset) throw new Error(`Le jeu de données n'existe pas, id${processingConfig.dataset.id}`)
    await log.info(`Le jeu de donnée existe, id="${dataset.id}", title="${dataset.title}"`)
  }

  await log.info('Envoi des données')
  const filePath = path.join(dir, 'recensement.csv')
  const readStream = fs.createReadStream(filePath)
  let lines = []
  await pump(
    readStream,
    csv.parse({ columns: true, delimiter: ',', cast: true }),
    new Transform({
      objectMode: true,
      transform: async (row, _, next) => {
        lines.push(row)
        if (lines.length === 1000) {
          await log.info('Envoi de 1000 lignes')
          await axios.post(`api/v1/datasets/${dataset.id}/_bulk_lines`, lines)
          lines = []
        }
        next()
      }
    })
  )

  if (lines.length > 0) {
    await log.info(`Envoi de ${lines.length} lignes`)
    await axios.post(`api/v1/datasets/${dataset.id}/_bulk_lines`, lines)
  }
  await log.info('Toutes les lignes ont été envoyées')
}
