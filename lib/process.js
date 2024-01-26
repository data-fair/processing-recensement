const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const createCsvWriter = require('csv-writer').createObjectCsvWriter
const path = require('path')
const fs = require('fs-extra')

// add more years (https://api.insee.fr/catalogue/site/themes/wso2/subthemes/insee/pages/item-info.jag?name=DonneesLocales&version=V0.1&provider=insee#!/default/getDonnees)
// Documentation RP
const datasetRPYear = {
  2006: 'RP2006',
  2007: 'RP2007',
  2008: 'RP2008',
  2009: 'RP2009',
  2010: 'RP2010',
  2011: 'RP2011',
  2012: 'RP2012',
  2013: 'RP2013',
  2014: 'RP2014',
  2015: 'RP2015',
  2016: 'GEO2019RP2016',
  2017: 'GEO2020RP2017',
  2018: 'GEO2021RP2018',
  2019: 'GEO2022RP2019'
}

const URLSexeAge = 'https://api.insee.fr/donnees-locales/V0.1/donnees/geo-SEXE-AGE15_15_90@'
const labelsAgesSexe = {
  '00': 'entre_0_14',
  15: 'entre_15_29',
  30: 'entre_30_44',
  45: 'entre_45_59',
  60: 'entre_60_74',
  75: 'entre_75_89',
  90: 'entre_90_plus',
  ENS: 'population',
  1: 'hommes',
  2: 'femmes'
}

module.exports = async (accessToken, processingConfig, axios, dir, log) => {
  const years = processingConfig.years ? processingConfig.years.split('-').sort() : Object.keys(datasetRPYear) // Récupération des années à traiter (Soit celles passées en paramètre, soit toutes celles disponibles)

  async function fetchData (url) {
    const data = await axios({
      method: 'get',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    }).catch(async (err) => {
      if (err.status === 429) {
        await wait(1000)
        return await fetchData(url)
      } else {
        await log.error(err)
      }
    })
    return data
  }

  await log.step('Récupération des codes communes')
  let URLCommunes = 'https://opendata.koumoul.com/data-fair/api/v1/datasets/communes-de-france/lines?size=1000&select=code_commune'

  if (processingConfig.filter && processingConfig.filter.codeType !== 'all' && processingConfig.filter.code) {
    URLCommunes += `&q=${processingConfig.filter.code}&q_fields=${processingConfig.filter.codeType}`
    await log.info(`Filtre sur ${processingConfig.filter.codeType} ${processingConfig.filter.code}`)
  }
  await log.info('URL : ' + URLCommunes)

  const codes = []
  let next = URLCommunes
  while (next) {
    const communes = (await axios({
      method: 'get',
      url: next,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }).catch(async (err) => {
      log.error(err)
    })).data
    for (const commune of communes.results) {
      codes.push(commune.code_commune)
    }
    next = communes.next
  }
  if (codes.length === 0) {
    await log.error('Aucune commune récupérée')
    return
  } else {
    await log.info(`${codes.length} communes récupérées`)
  }

  await log.step('Création du fichier temporaire')
  await fs.ensureDir(dir)
  const csvWriter = await createCsvWriter({
    path: path.join(dir, '/recensement.csv'),

    header: [
      { id: 'code', title: 'code' },
      { id: 'annee', title: 'annee' },
      { id: 'population', title: 'population' },
      { id: 'entre_0_14', title: 'entre_0_14' },
      { id: 'entre_15_29', title: 'entre_15_29' },
      { id: 'entre_30_44', title: 'entre_30_44' },
      { id: 'entre_45_59', title: 'entre_45_59' },
      { id: 'entre_60_74', title: 'entre_60_74' },
      { id: 'entre_75_89', title: 'entre_75_89' },
      { id: 'entre_90_plus', title: 'entre_90_plus' },
      { id: 'hommes', title: 'hommes' },
      { id: 'femmes', title: 'femmes' }
    ]
  })

  for (const year of years) {
    await log.step(`Récupération de l'année ${year}`)
    const jeuRP = datasetRPYear[year] // Récupère le code du RP de l'année

    if (!jeuRP) {
      await log.warning(`L'année ${year} n'est pas disponible.`)
      continue // Passe à l'année suivante
    }

    let nbDoneCommunes = 0
    await log.task('Récupération des données par communes')
    for (const code of codes) { // Pour chaque communes sélectionnées
      const commune = {
        code,
        annee: year,
        population: '',
        entre_0_14: '',
        entre_15_29: '',
        entre_30_44: '',
        entre_45_59: '',
        entre_60_74: '',
        entre_75_89: '',
        entre_90_plus: '',
        hommes: '',
        femmes: ''
      }

      // Proportion par age, par sexe et total
      const urlFull = URLSexeAge + `${jeuRP}/COM-${code}.all.all`
      const RPData = await fetchData(urlFull)
      if (RPData && RPData.data && RPData.data.Cellule) {
        RPData.data.Cellule.forEach((ligne) => { // Pour chaque valeurs issue du croisement sexe/age
          if (ligne.Modalite[1]['@code'] === 'ENS') { // Sexe & Total
            const typeLigne = labelsAgesSexe[ligne.Modalite[0]['@code']]
            commune[typeLigne] = Math.floor(ligne.Valeur)
          } else { // age
            const typeLigne = labelsAgesSexe[ligne.Modalite[1]['@code']]
            commune[typeLigne] = Math.floor(ligne.Valeur)
          }
        })
      }
      await wait(2000)
      if (commune.code) {
        await csvWriter.writeRecords([commune])
      }
      nbDoneCommunes++
      await log.progress('Récupération des données par communes', nbDoneCommunes, codes.length)
    }

    await log.info(`Année ${year} terminée`)
  }
}
