import { getShapesAsGeoJSON, getStopsAsGeoJSON } from 'gtfs';
import simplify from '@turf/simplify';
import { featureCollection, round } from '@turf/helpers';
import { logWarning } from './log-utils.js';
import { getBaseTripIds } from './trip-id-utils.js';

import type { Config, FormattedTimetable } from '../types/index.ts';

type GeoJSONFeatureCollection = GeoJSON.FeatureCollection;

/*
 * Merge any number of geojson objects into one. Only works for `FeatureCollection`.
 */
const mergeGeojson = (...geojsons: GeoJSONFeatureCollection[]) =>
  featureCollection(geojsons.flatMap((geojson) => geojson.features));

/*
 * Truncate a geojson coordinates to a specific number of decimal places.
 */
const truncateGeoJSONDecimals = (
  geojson: GeoJSONFeatureCollection,
  config: Config,
) => {
  for (const feature of geojson.features) {
    if (feature.geometry.type === 'Point') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (number: number) => round(number, config.coordinatePrecision ?? 5),
      );
    } else if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (coordinate: number[]) =>
          coordinate.map((number: number) =>
            round(number, config.coordinatePrecision ?? 5),
          ),
      );
    } else if (feature.geometry.type === 'MultiLineString') {
      feature.geometry.coordinates = feature.geometry.coordinates.map(
        (linestring: number[][]) =>
          linestring.map((coordinate: number[]) =>
            coordinate.map((number: number) =>
              round(number, config.coordinatePrecision ?? 5),
            ),
          ),
      );
    }
  }

  return geojson;
};

/*
 * Get the geoJSON for a timetable.
 */
export function getTimetableGeoJSON(
  timetable: FormattedTimetable,
  config: Config,
) {
  const tripIds = getBaseTripIds(timetable.orderedTrips);

  const shapesGeojsons = timetable.route_ids.map((routeId: string) =>
    getShapesAsGeoJSON({
      route_id: routeId,
      direction_id: timetable.direction_id,
      trip_id: tripIds,
    }),
  );

  const stopsGeojsons = timetable.route_ids.map((routeId: string) =>
    getStopsAsGeoJSON({
      route_id: routeId,
      direction_id: timetable.direction_id,
      trip_id: tripIds,
    }),
  );

  const geojson = mergeGeojson(...shapesGeojsons, ...stopsGeojsons);

  let simplifiedGeojson;
  try {
    simplifiedGeojson = simplify(geojson, {
      tolerance: 1 / 10 ** (config.coordinatePrecision ?? 5),
      highQuality: true,
    });
  } catch {
    timetable.warnings?.push(
      `Timetable ${timetable.timetable_id} - Unable to simplify geojson`,
    );
    simplifiedGeojson = geojson;
  }

  return truncateGeoJSONDecimals(simplifiedGeojson, config);
}

/*
 * Get the geoJSON for an agency (all routes and stops).
 */
export function getAgencyGeoJSON(config: Config) {
  const shapesGeojsons = getShapesAsGeoJSON();
  const stopsGeojsons = getStopsAsGeoJSON();

  const geojson = mergeGeojson(shapesGeojsons, stopsGeojsons);

  let simplifiedGeojson;
  try {
    simplifiedGeojson = simplify(geojson, {
      tolerance: 1 / 10 ** (config.coordinatePrecision ?? 5),
      highQuality: true,
    });
  } catch {
    logWarning(config)('Unable to simplify geojson');
    simplifiedGeojson = geojson;
  }

  return truncateGeoJSONDecimals(simplifiedGeojson, config);
}
