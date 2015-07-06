 /*
 // Valid options
 // mongo_url
 // agencies
 // effectiveDate
 // noServiceSymbol
 // requestStopSymbol
 */

module.exports = {
  mongo_url: process.env.MONGOHQ_URL || 'mongodb://localhost:27017/gtfs',
  agencies: [
    {
      agency_key: 'eldoradotransit-ca-us',
      url: 'http://data.trilliumtransit.com/gtfs/eldoradotransit-ca-us/eldoradotransit-ca-us.zip'
    }
  ],
  effectiveDate: 'July 8, 2015',
  noServiceSymbol: '—',
  requestStopSymbol: '***'
};
