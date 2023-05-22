const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const path = require('path')
const fs = require('fs-extra')
const jsoncsv = require('json-2-csv')
async function tokenExpired (token, processingConfig, axios, tmpDir, log) {
  if (!token.access_token || token.expiration < Date.now()) {
    log.info('token expired')
    token = { data: {} }
    const key = Buffer.from(`${processingConfig.apiKey}:`).toString('base64')
    await log.info('Token expiré, récupération d\'un nouveau token')
    while (!token.data.access_token) {
      token = await axios({
        method: 'post',
        url: 'https://api.insee.fr/token',
        data: 'grant_type=client_credentials',
        headers: { Authorization: 'Basic ' + key }
      }).catch((err) => {
        log.info('Erreur lors de la récupération du token, réessai dans 1 secondes')
        log.info(JSON.stringify(err, null, 2))
      })
      await wait(1000)
    }
    token.data.expiration = Date.now() + token.data.expires_in * 1000
    await fs.writeFileSync(path.join(tmpDir, 'token.json'), JSON.stringify(token.data, null, 2))
    token = token.data
  }
  return token
}
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
module.exports = async (processingConfig, axios, dir, log, token) => {
  let years = []
  if (processingConfig.year) {
    if (processingConfig.year.includes('-')) {
      years = processingConfig.year.split('-')
    } else {
      years.push(processingConfig.year)
    }
    years.sort()
  } else {
    years = Object.keys(datasetRPYear)
  }

  const rencensement = []

  let accessToken = token.access_token
  const codes = []
  await log.step('Récupération des codes communes')
  const communes = await axios({
    method: 'get',
    url: 'https://api.insee.fr/metadonnees/V1/geo/communes?com=true',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }).catch(async (err) => {
    token = await tokenExpired(token, processingConfig, axios, dir, log)
    accessToken = token.access_token
    log.error(err)
  })
  if (communes && communes.data) {
    for (const commune of communes.data) {
      codes.push(commune.code)
    }
  }

  await log.step('Récupération des données')

  for (const year of years) {
    let verifJeu = true
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
              url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-IND_POPLEGALES@${jeuPop}/COM-${code}.1`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                await wait(1000)
              } else if (err.status === 404) {
                done = true
                log.error('La population n\'est pas disponible pour cette année')
              } else if (err.status === 401) {
                token = await tokenExpired(token, processingConfig, axios, dir, log)
                accessToken = token.access_token
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
          }

          done = false
          while (!done) {
            done = true
            verifJeu = true
            const ages = await axios({
              method: 'get',
              url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-SEXE-AGE15_15_90@${jeuRP}/COM-${code}.all.all`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                done = false
                await wait(1000)
              } else if (err.status === 404) {
                done = true
                verifJeu = false
              } else if (err.status === 401) {
                token = await tokenExpired(token, processingConfig, axios, dir, log)
                accessToken = token.access_token
              }
            }
            )
            if (verifJeu) {
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
            }
          }
          done = false
          while (!done) {
            verifJeu = true
            done = true
            const voit = await axios({
              method: 'get',
              url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-voit@${jeuRP}/COM-${code}.all`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json'
              }
            }).catch(async (err) => {
              if (err.status === 429) {
                done = false
                await wait(1000)
              } else if (err.status === 404) {
                done = true
                verifJeu = false
              } else if (err.status === 401) {
                token = await tokenExpired(token, processingConfig, axios, dir, log)
                accessToken = token.access_token
              }
            }
            )
            if (verifJeu) {
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
          }
          done = false

          // Only for more than 2000 inhabitants
          if (commune.population_municipale >= 2000) {
            while (!done) {
              done = true
              verifJeu = true
              const typmr = await axios({
                method: 'get',
                url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-TYPMR@${jeuRP}/COM-${code}.all`,
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  Accept: 'application/json'
                }
              }).catch(async (err) => {
                if (err.status === 429) {
                  done = false
                  await wait(1000)
                } else if (err.status === 404) {
                  done = true
                  verifJeu = false
                } else if (err.status === 401) {
                  token = await tokenExpired(token, processingConfig, axios, dir, log)
                  accessToken = token.access_token
                }
              }
              )
              if (verifJeu) {
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
              }
            }
          } else if (!commune.homme_seul && verifJeu) {
            for (const value of Object.values(labelsTypMenage)) {
              commune[value] = ''
            }
          }
          if (years.length > 1 && verifJeu) {
            commune.annee = year
          }
          if (commune.code) {
            rencensement.push(commune)
          }
        }
      }
    } else {
      await log.error(`L'année ${year} n'est pas disponible, vous pouvez renseigner le nom du jeu de données correspondant`)
    }
    if (verifJeu) {
      await log.info(`Année ${year} terminée`)
    } else {
      await log.error(`Le jeu de données ${jeuRP} n'est pas disponible`)
    }
  }
  if (rencensement.length > 0) {
    await log.info('Ecriture du fichier csv')
    await fs.ensureDirSync(path.join(dir))
    const csv = await jsoncsv.json2csv(rencensement)
    await fs.writeFile(path.join(dir, 'data.csv'), csv)
    await log.info('Fichier csv créé')
  } else {
    await log.error('Aucune donnée récupérée')
  }
}
