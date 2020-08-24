const gtfs = require('gtfs');
const simplify = require('@turf/simplify');
const { featureCollection } = require('@turf/helpers');

/*
 * Merge any number of geojson objects into one. Only works for `FeatureCollection`.
 */
const mergeGeojson = (...geojsons) => {
  return featureCollection(geojsons.reduce((memo, geojson) => [...memo, ...geojson.features], []));
};

/*
 * Get the geoJSON for a timetable.
 */
exports.getTimetableGeoJSON = async (timetable, config) => {
  const shapesGeojsons = await Promise.all(timetable.route_ids.map(routeId => {
    return gtfs.getShapesAsGeoJSON({
      route_id: routeId,
      direction_id: timetable.direction_id
    });
  }));

  const stopsGeojsons = await Promise.all(timetable.route_ids.map(routeId => {
    return gtfs.getStopsAsGeoJSON({
      route_id: routeId,
      direction_id: timetable.direction_id
    });
  }));

  const geojson = mergeGeojson(...shapesGeojsons, ...stopsGeojsons);
  return simplify(geojson, {
    tolerance: 1 / (10 ** config.coordinatePrecision),
    highQuality: true
  });
};

/*
 * Get the geoJSON for an agency (all routes and stops).
 */
exports.getAgencyGeoJSON = async config => {
  const shapesGeojson = await gtfs.getShapesAsGeoJSON();
  return simplify(shapesGeojson, {
    tolerance: 1 / (10 ** config.coordinatePrecision),
    highQuality: true
  });
};
