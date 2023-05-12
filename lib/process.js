const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const path = require('path')
const fs = require('fs-extra')
const jsoncsv = require('json-2-csv')
module.exports = async (processingConfig, axios, dir, log, token) => {
  const accessToken = token.access_token
  const codes = []
  await log.step('Récupération des codes communes')
  const communes = await axios({
    method: 'get',
    url: 'https://api.insee.fr/metadonnees/V1/geo/communes?com=true',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).catch((err) => {
    console.log(err)
  })
  if (communes && communes.data) {
    for (const commune of communes.data) {
      codes.push(commune.code)
    }
  }
  const rencensement = []
  await log.step('Récupération des données')
  for (const code of codes) {
    if (code.substr(0, 2) === processingConfig.filter) {
      let done = false
      let commune = {}
      const labels = ['Ensemble', 'moins_15', '_15_24', '_25_54', '_55_plus']
      while (!done) {
        let population = await axios({
          method: 'get',
          url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-IND_POPLEGALES@POPLEG2019/COM-${code}.1`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }

        }).catch(async (err) => {
          if (err.status === 429) {
            await wait(2000)
          }
        })

        if (population) {
          population = population.data.Cellule
          commune = {
            code,
            population_municipale: population[0].Valeur
          }
          done = true
        }
      }
      done = false
      while (!done) {
        done = true
        const ages = await axios({
          method: 'get',
          url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-SEXE-AGE4-IMMI@GEO2022RP2019/COM-${code}.ENS.all.ENS`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }).catch(async (err) => {
          if (err.status === 429) {
            done = false
            await wait(2000)
          }
        }
        )

        let cpt = 0
        if (ages && ages.data && ages.data.Cellule && ages.data.Cellule.length === 5) {
          ages.data.Cellule.forEach((age) => {
            commune[labels[cpt]] = Math.floor(age.Valeur)
            cpt++
          }
          )
        }
      }
      if (!commune.Ensemble) {
        for (const label of labels) {
          commune[label] = 'NR'
        }
      }
      rencensement.push(commune)
    }
  }
  await log.info('Ecriture du fichier csv')
  await fs.ensureDirSync(path.join(dir))
  const csv = await jsoncsv.json2csv(rencensement)
  await fs.writeFile(path.join(dir, 'data.csv'), csv)
  await log.info('Fichier csv créé')
}
