const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const path = require('path')
const fs = require('fs-extra')
const jsoncsv = require('json-2-csv')
async function tokenExpired (token, processingConfig, axios, tmpDir, log) {
  if (!token.access_token || token.expiration < Date.now()) {
    console.log('token expired')
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
module.exports = async (processingConfig, axios, dir, log, token) => {
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
    console.log(err)
  })
  if (communes && communes.data) {
    for (const commune of communes.data) {
      codes.push(commune.code)
    }
  }
  const rencensement = []
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
  const jeuPop = 'POPLEG2019'
  const jeuRP = 'GEO2022RP2019'
  await log.step('Récupération des données')

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
          token = await tokenExpired(token, processingConfig, axios, dir, log)
          accessToken = token.access_token
          if (err.status === 429) {
            await wait(1000)
          }
        })

        if (population) {
          population = population.data.Cellule
          commune = {
            code,
            population_municipale: Number(population[0].Valeur)
          }
          done = true
        }
      }
      done = false
      while (!done) {
        done = true
        const ages = await axios({
          method: 'get',
          url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-SEXE-AGE15_15_90@${jeuRP}/COM-${code}.all.all`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }).catch(async (err) => {
          token = await tokenExpired(token, processingConfig, axios, dir, log)
          accessToken = token.access_token
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
      }
      done = false

      done = false
      while (!done) {
        done = true
        const voit = await axios({
          method: 'get',
          url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-voit@${jeuRP}/COM-${code}.all`,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        }).catch(async (err) => {
          token = await tokenExpired(token, processingConfig, axios, dir, log)
          accessToken = token.access_token
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
              commune.nb_menages = Math.floor(elem.Valeur)
            }
            if (elem.Modalite['@code'] !== 'ENS' && elem.Modalite['@code'] !== '0') {
              commune.nb_au_moins_une_voiture += Math.floor(elem.Valeur)
            }
          })
        }
      }
      done = false
      // Only for more than 2000 inhabitants
      if (commune.population_municipale >= 2000) {
        while (!done) {
          done = true
          const typmr = await axios({
            method: 'get',
            url: `https://api.insee.fr/donnees-locales/V0.1/donnees/geo-TYPMR@${jeuRP}/COM-${code}.all`,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json'
            }
          }).catch(async (err) => {
            if (err.status === 429) {
              token = await tokenExpired(token, processingConfig, axios, dir, log)
              accessToken = token.access_token
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
        }
      } else if (!commune.homme_seul) {
        for (const value of Object.values(labelsTypMenage)) {
          commune[value] = ''
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
