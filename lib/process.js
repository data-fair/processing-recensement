const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

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

module.exports = async (accessToken, processingConfig, axios, log, dataset) => {
  const years = processingConfig.years ? processingConfig.years.sort() : Object.keys(datasetRPYear) // Récupération des années à traiter (Soit celles passées en paramètre, soit toutes celles disponibles)

  // Fonction pour récupérer les données
  // Cette fonction est récursive pour gérer les erreurs 429 (limite d'api atteinte)
  async function fetchData (url) {
    const data = await axios({
      method: 'get',
      url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    }).catch(async (err) => {
      if (err.status === 429) { // Limite d'api atteinte
        await wait(1000)
        await log.warning('Limite d\'api atteinte, nouvelle tentative')
        return await fetchData(url)
      } else {
        await log.error(`Erreur lors de la récupération des données : ${JSON.stringify(err)}`)
      }
    })
    return data
  }

  await log.step('Récupération des codes communes')
  let URLCommunes = 'https://opendata.koumoul.com/data-fair/api/v1/datasets/communes-de-france/lines?size=1000&select=code_commune'

  if (processingConfig.codeType !== 'all' && processingConfig.code) {
    URLCommunes += `&q=${processingConfig.code}&q_fields=${processingConfig.codeType}`
    await log.info(`Filtre sur ${processingConfig.codeType} ${processingConfig.code}`)
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

  for (const year of years) {
    await log.step(`Récupération de l'année ${year}`)
    const jeuRP = datasetRPYear[year] // Récupère le code du RP de l'année

    if (!jeuRP) {
      await log.warning(`L'année ${year} n'est pas disponible.`)
      continue // Passe à l'année suivante
    }

    let nbDoneCommunes = 0
    let communes = []
    await log.task('Récupération des données par communes')
    for (const code of codes) { // Pour chaque communes sélectionnées
      const commune = {
        code,
        annee: parseInt(year)
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
        communes.push(commune)
      }
      nbDoneCommunes++
      await log.progress('Récupération des données par communes', nbDoneCommunes, codes.length)

      if (communes.length >= 1000) {
        await log.info('Envoi de 1000 lignes')
        try {
          await axios.post(`api/v1/datasets/${dataset.id}/_bulk_lines`, communes)
          await log.info('Données envoyées')
        } catch (error) {
          await log.error(`Erreur lors de l'envoi des données : ${JSON.stringify(error)}`)
          await log.error(`Données : ${JSON.stringify(communes)}`)
        }
        communes = []
      }
    }

    await log.info('Envoi des lines restantes')
    try {
      await axios.post(`api/v1/datasets/${dataset.id}/_bulk_lines`, communes)
      await log.info('Données envoyées')
    } catch (error) {
      await log.error(`Erreur lors de l'envoi des données : ${JSON.stringify(error)}`)
      await log.error(`Données : ${JSON.stringify(communes)}`)
    }

    await log.info(`Année ${year} terminée`)
  }
}
