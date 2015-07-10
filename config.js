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
      url: 'https://dl.dropboxusercontent.com/u/33568/eldorado-gtfs.zip'
    }
  ],
  effectiveDate: 'July 8, 2015',
  noServiceSymbol: '—',
  requestStopSymbol: '***'
};
