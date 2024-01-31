module.exports = {
  isRest: true,
  title: 'Recensement',
  primaryKey: [
    'code',
    'annee'
  ],
  schema: [
    {
      key: 'code',
      type: 'string',
      title: 'Code commune',
      description: 'Code commune issue de l\'INSEE'
    },
    {
      key: 'annee',
      type: 'integer',
      title: 'Année',
      description: 'Année de référence des données'
    },
    {
      key: 'population',
      type: 'integer',
      title: 'Population',
      description: 'Population municipale de la commune'
    },
    {
      key: 'hommes',
      type: 'integer',
      title: 'Hommes',
      description: 'Nombre d\'hommes dans la commune'
    },
    {
      key: 'femmes',
      type: 'integer',
      title: 'Femmes',
      description: 'Nombre de femmes dans la commune'
    },
    {
      key: 'entre_0_14',
      type: 'integer',
      title: 'Entre 0 et 14 ans',
      description: 'Nombre de personnes de 0 à 14 ans dans la commune'
    },
    {
      key: 'entre_15_29',
      type: 'integer',
      title: 'Entre 15 et 29 ans',
      description: 'Nombre de personnes de 15 à 29 ans dans la commune'
    },
    {
      key: 'entre_30_44',
      type: 'integer',
      title: 'Entre 30 et 44 ans',
      description: 'Nombre de personnes de 30 à 44 ans dans la commune'
    },
    {
      key: 'entre_45_59',
      type: 'integer',
      title: 'Entre 45 et 59 ans',
      description: 'Nombre de personnes de 45 à 59 ans dans la commune'
    },
    {
      key: 'entre_60_74',
      type: 'integer',
      title: 'Entre 60 et 74 ans',
      description: 'Nombre de personnes de 60 à 74 ans dans la commune'
    },
    {
      key: 'entre_75_89',
      type: 'integer',
      title: 'Entre 75 et 89 ans',
      description: 'Nombre de personnes de 75 à 89 ans dans la commune.'
    },
    {
      key: 'entre_90_plus',
      type: 'integer',
      title: '90 ans et plus',
      description: 'Nombre de personnes de 90 ans et plus dans la commune'
    }
  ]
}
