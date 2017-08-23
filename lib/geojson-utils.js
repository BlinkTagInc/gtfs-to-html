const geojsonMerge = require('@mapbox/geojson-merge');
const gtfs = require('gtfs');
const simplify = require('simplify-geojson');

exports.getTimetableGeoJSON = async (timetable, config) => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    direction_id: timetable.direction_id
  });

  const stopsGeojson = await gtfs.getStopsAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: timetable.route_id,
    direction_id: timetable.direction_id
  });

  const geojson = await geojsonMerge.merge([shapesGeojson, stopsGeojson]);
  return simplify(geojson, 1 / Math.pow(10, config.coordinatePrecision));
};

exports.getAgencyGeoJSON = async (agencyKey, config) => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON({agency_key: agencyKey});
  return simplify(shapesGeojson, 1 / Math.pow(10, config.coordinatePrecision));
};
