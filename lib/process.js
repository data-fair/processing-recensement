const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const path = require('path')
const fs = require('fs-extra')
const jsoncsv = require('json-2-csv')

const labelsAgesSexe = {
  '00': 'entre_0_14',
  15: 'entre_15_29',
  30: 'entre_30_44',
  45: 'entre_45_59',
  60: 'entre_60_74',
  75: 'entre_75_plus', // 75 à 89
  90: 'entre_75_plus', // 90 et plus
  1: 'hommes',
  2: 'femmes'
}

const labelsTypMenage = {
  11: 'homme_seul',
  12: 'femme_seule',
  31: 'famille_monoparentale', // homme
  32: 'famille_monoparentale', // femme
  20: 'plusieurs_personnes_sans_enfants',
  41: 'couple_avec_enfant', // deux avec emplois
  42: 'couple_avec_enfant', // homme avec emploi
  43: 'couple_avec_enfant', // femme avec emploi
  44: 'couple_avec_enfant' // deux sans emploi
}
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
const URLCommunes = 'https://api.insee.fr/metadonnees/V1/geo/communes?com=true'
const URLPop = 'https://api.insee.fr/donnees-locales/V0.1/donnees/geo-IND_POPLEGALES@'
const URLSexeAge = 'https://api.insee.fr/donnees-locales/V0.1/donnees/geo-SEXE-AGE15_15_90@'
const URLVoiture = 'https://api.insee.fr/donnees-locales/V0.1/donnees/geo-voit@'
const URLTypeMenage = 'https://api.insee.fr/donnees-locales/V0.1/donnees/geo-TYPMR@'
module.exports = async (processingConfig, axios, dir, log) => {
  const years = processingConfig.year ? processingConfig.year.split('-').sort() : Object.keys(datasetRPYear).sort()
  let rencensement = []

  const accessToken = processingConfig.apiAccessToken
  const codes = []
  await log.step('Récupération des codes communes')
  const communes = await axios({
    method: 'get',
    url: URLCommunes,
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).catch(async (err) => {
    log.error(err)
  })
  if (communes && communes.data) {
    for (const commune of communes.data) {
      codes.push(commune.code)
    }
  }
  await log.step('Récupération des données')
  for (const year of years) {
    if (processingConfig.datasetRP) {
      if (!datasetRPYear[year] && processingConfig.datasetRP.includes('-')) {
        const yearsRP = processingConfig.datasetRP.split('-')
        for (const yearRP of yearsRP) {
          if (yearRP.includes(year)) {
            datasetRPYear[year] = yearRP
          }
        }
      } else if (!datasetRPYear[year] && processingConfig.datasetRP.includes(year)) {
        datasetRPYear[year] = processingConfig.datasetRP
      }
    }
    const jeuRP = datasetRPYear[year]
    const jeuPop = `POPLEG${year}`
    await log.step(`Année ${year}`)
    if (jeuRP) {
      for (const code of codes) {
        let filter
        if (processingConfig.filter) {
          filter = (processingConfig.filter.length === 2) ? code.substr(0, 2) === processingConfig.filter : code.substr(0, 3) === processingConfig.filter
        }
        if (!processingConfig.filter || filter) {
          let done = false
          let commune = {}
          while (!done) {
            let population = await axios({
              method: 'get',
              url: URLPop + `${jeuPop}/COM-${code}.1`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                await wait(1000)
              }
            })
            if (population && population.data && population.data.Cellule) {
              population = population.data.Cellule
              commune = {
                code,
                population_municipale: Number(population[0].Valeur)
              }
              done = true
            } else if (population) {
              commune = {
                code,
                population_municipale: ''
              }
              done = true
            }
            await wait(2000)
          }
          done = false
          while (!done) {
            done = true
            const ages = await axios({
              method: 'get',
              url: URLSexeAge + `${jeuRP}/COM-${code}.all.all`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                done = false
                await wait(1000)
              }
            }
            )

            for (const value of Object.values(labelsAgesSexe)) {
              commune[value] = 0
            }
            if (ages && ages.data && ages.data.Cellule) {
              ages.data.Cellule.forEach((age) => {
                if (age.Modalite[0]['@code'] !== 'ENS' && age.Modalite[1]['@code'] !== 'ENS') {
                  for (const modalite of age.Modalite) {
                    commune[labelsAgesSexe[modalite['@code']]] += Math.floor(age.Valeur)
                  }
                }
              })
            }
            for (const value of Object.values(labelsAgesSexe)) {
              if (commune[value] === 0) {
                commune[value] = ''
              }
            }
            await wait(2000)
          }

          done = false
          while (!done) {
            done = true
            const voit = await axios({
              method: 'get',
              url: URLVoiture + `${jeuRP}/COM-${code}.all`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                done = false
                await wait(1000)
              }
            }
            )

            commune.nb_au_moins_une_voiture = 0
            if (voit && voit.data && voit.data.Cellule) {
              voit.data.Cellule.forEach((elem) => {
                if (elem.Modalite['@code'] === 'ENS') {
                  commune.nb_menages = Math.floor(elem.Valeur) || ''
                }
                if (elem.Modalite['@code'] !== 'ENS' && elem.Modalite['@code'] !== '0') {
                  commune.nb_au_moins_une_voiture += Math.floor(elem.Valeur)
                }
              })
            }
            if (commune.nb_menages === undefined) {
              commune.nb_menages = ''
            }
            if (commune.nb_au_moins_une_voiture === 0) {
              commune.nb_au_moins_une_voiture = ''
            }
          }
          done = false

          // Only for more than 2000 inhabitants
          if (commune.population_municipale >= 2000) {
            while (!done) {
              done = true
              const typmr = await axios({
                method: 'get',
                url: URLTypeMenage + `${jeuRP}/COM-${code}.all`,
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/json'
                }
              }).catch(async (err) => {
                if (err.status === 429) {
                  done = false
                  await wait(1000)
                }
              }
              )

              if (typmr && typmr.data && typmr.data.Cellule) {
                commune.couple_avec_enfant = 0
                commune.famille_monoparentale = 0
                typmr.data.Cellule.forEach((type) => {
                  if (type.Modalite['@code'] !== 'ENS' && labelsTypMenage[type.Modalite['@code']] && type.Mesure['@code'] === 'NBLOG') {
                    if (labelsTypMenage[type.Modalite['@code']] === 'couple_avec_enfant' || labelsTypMenage[type.Modalite['@code']] === 'famille_monoparentale') {
                      commune[labelsTypMenage[type.Modalite['@code']]] += Math.floor(type.Valeur)
                    } else {
                      commune[labelsTypMenage[type.Modalite['@code']]] = Math.floor(type.Valeur)
                    }
                  }
                })
              }
              await wait(2000)
            }
          } else if (!commune.homme_seul) {
            for (const value of Object.values(labelsTypMenage)) {
              commune[value] = ''
            }
          }
          if (years.length > 1) {
            commune.annee = year
          }
          if (commune.code) {
            rencensement.push(commune)
          }
        }
      }
    } else {
      await log.warning(`L'année ${year} n'est pas disponible, années diponibles entre 2006 et 2019`)
    }

    await log.info(`Année ${year} terminée`)
    if (rencensement.length > 0) {
      await log.info('Ecriture du fichier csv')

      const filePath = path.join(dir, 'recensement.csv')
      const fileExists = await fs.existsSync(filePath)
      let csv = ''
      // if file exists, append to it
      if (fileExists) {
        csv = await jsoncsv.json2csv(rencensement)
        csv = csv.replace(/^(.*\n)/, '')
        csv = csv + '\n'
        await fs.appendFile(filePath, csv)
      } else { // else create it
        await fs.ensureFileSync(filePath)
        csv = await jsoncsv.json2csv(rencensement)
        csv = csv + '\n'
        await fs.writeFile(filePath, csv)
      }
      rencensement = []
    } else {
      await log.error('Aucune donnée récupérée')
    }
  }
}
