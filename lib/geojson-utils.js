const gtfs = require('gtfs');
const simplify = require('@turf/simplify');

/*
 * Merge any number of geojson objects into one. Only works for `FeatureCollection`.
 */
const mergeGeojson = (...geojsons) => {
  return {
    type: 'FeatureCollection',
    features: geojsons.reduce((memo, geojson) => [...memo, ...geojson.features], [])
  };
};

/*
 * Get the geoJSON for a timetable.
 */
exports.getTimetableGeoJSON = async (timetable, config) => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: {
      $in: timetable.route_ids
    },
    direction_id: timetable.direction_id
  });

  const stopsGeojson = await gtfs.getStopsAsGeoJSON({
    agency_key: timetable.agency_key,
    route_id: {
      $in: timetable.route_ids
    },
    direction_id: timetable.direction_id
  });

  const geojson = mergeGeojson(shapesGeojson, stopsGeojson);
  return simplify(geojson, {
    tolerance: 1 / (10 ** config.coordinatePrecision),
    highQuality: true
  });
};

/*
 * Get the geoJSON for an agency (all routes and stos).
 */
exports.getAgencyGeoJSON = async (agencyKey, config) => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON({ agency_key: agencyKey });
  return simplify(shapesGeojson, {
    tolerance: 1 / (10 ** config.coordinatePrecision),
    highQuality: true
  });
};
