const gtfs = require('gtfs');
const {
  flatMap
} = require('lodash');
const simplify = require('@turf/simplify');
const {
  featureCollection
} = require('@turf/helpers');

/*
 * Merge any number of geojson objects into one. Only works for `FeatureCollection`.
 */
const mergeGeojson = (...geojsons) => featureCollection(flatMap(geojsons, geojson => geojson.features));

/*
 * Truncate a coordinate to a specific number of decimal places.
 */
const truncateCoordinate = (coordinate, precision) => {
  return [
    Math.round(coordinate[0] * (10 ** precision)) / (10 ** precision),
    Math.round(coordinate[1] * (10 ** precision)) / (10 ** precision)
  ];
};

/*
 * Truncate a geojson coordinates to a specific number of decimal places.
 */
const truncateGeoJSONDecimals = (geojson, config) => {
  for (const feature of geojson.features) {
    if (feature.geometry.coordinates) {
      if (feature.geometry.type.toLowerCase() === 'point') {
        feature.geometry.coordinates = truncateCoordinate(feature.geometry.coordinates, config.coordinatePrecision);
      } else if (feature.geometry.type.toLowerCase() === 'linestring') {
        feature.geometry.coordinates = feature.geometry.coordinates.map(coordinate => truncateCoordinate(coordinate, config.coordinatePrecision));
      }
    }
  }

  return geojson;
};

/*
 * Simplify geojson to a specific tolerance
 */
const simplifyGeoJSON = (geojson, config) => {
  try {
    const simplifiedGeojson = simplify(geojson, {
      tolerance: 1 / (10 ** config.coordinatePrecision),
      highQuality: true
    });

    return truncateGeoJSONDecimals(simplifiedGeojson, config);
  } catch {
    config.logWarning('Unable to simplify geojson');

    return truncateGeoJSONDecimals(geojson, config);
  }
};

/*
 * Get the geoJSON for a timetable.
 */
exports.getTimetableGeoJSON = async (timetable, config) => {
  const [shapesGeojsons, stopsGeojsons] = await Promise.all([
    await Promise.all(timetable.route_ids.map(routeId => {
      return gtfs.getShapesAsGeoJSON({
        route_id: routeId,
        direction_id: timetable.direction_id
      });
    })),
    await Promise.all(timetable.route_ids.map(routeId => {
      return gtfs.getStopsAsGeoJSON({
        route_id: routeId,
        direction_id: timetable.direction_id
      });
    }))
  ]);

  const geojson = mergeGeojson(...shapesGeojsons, ...stopsGeojsons);
  return simplifyGeoJSON(geojson, config);
};

/*
 * Get the geoJSON for an agency (all routes and stops).
 */
exports.getAgencyGeoJSON = async config => {
  const geojson = await gtfs.getShapesAsGeoJSON();
  return simplifyGeoJSON(geojson, config);
};
